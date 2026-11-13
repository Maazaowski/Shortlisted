"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, withUser } from "@shortlisted/db";
import { ParsedJobSchema, parseJob, provider } from "@shortlisted/core";
import { requireUser } from "@/lib/session";
import { createApplicationFromCapture } from "@/lib/applications";
import { enqueueFeedSync } from "@/lib/queue";

/** Save for later, or take it back. */
export async function toggleSavedAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  await withUser(user.id, async (tx) => {
    const listing = await tx.listing.findFirst({ where: { id, userId: user.id }, select: { savedAt: true } });
    if (listing) await tx.listing.updateMany({ where: { id, userId: user.id }, data: { savedAt: listing.savedAt ? null : new Date() } });
  });
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
}

/** Hide a listing from every pool, or bring it back. */
export async function toggleHiddenAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  await withUser(user.id, async (tx) => {
    const listing = await tx.listing.findFirst({ where: { id, userId: user.id }, select: { hiddenAt: true } });
    if (listing) await tx.listing.updateMany({ where: { id, userId: user.id }, data: { hiddenAt: listing.hiddenAt ? null : new Date() } });
  });
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Turns a listing into an application: the same path as a capture from the
 * extension, so everything after it (fit, selection, validation, PDFs) is
 * unchanged. The stage is SAVED, set by the capture. Applying stays a thing
 * the user does on the employer's page and marks themselves.
 */
export async function tailorListingAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  const listing = await withUser(user.id, (tx) => tx.listing.findFirst({ where: { id, userId: user.id } }));
  if (!listing) redirect("/jobs");
  if (listing.applicationId) redirect(`/applications/${listing.applicationId}`);

  const body = [listing.location ? `Location: ${listing.location}` : "", listing.description].filter(Boolean).join("\n\n");
  // Requirements the user already asked for go with the job, so the worker does not read the posting again.
  const parsed = listing.parsed ? ParsedJobSchema.safeParse(listing.parsed) : null;
  let applicationId: string;
  try {
    const result = await createApplicationFromCapture(user.id, {
      url: listing.url,
      pageTitle: `${listing.title} - ${listing.company}`,
      // The capture path prefers a JobPosting block, which carries the title and company without a model call.
      jsonLd: { "@type": "JobPosting", title: listing.title, hiringOrganization: { name: listing.company }, description: escapeHtml(body).replace(/\n/g, "<br>") },
      text: body,
    }, { parsed: parsed?.success ? parsed.data : undefined });
    applicationId = result.id;
  } catch (err) {
    redirect(`/jobs/${id}?error=${encodeURIComponent((err as Error).message)}`);
  }
  await withUser(user.id, (tx) => tx.listing.updateMany({ where: { id, userId: user.id }, data: { applicationId, savedAt: listing.savedAt ?? new Date() } }));
  redirect(`/applications/${applicationId}`);
}

export type RequirementsState = { error: string } | null;

/**
 * Reads one listing's requirements through the configured provider: the same
 * parse call the pipeline starts with, run early so the user can see what the
 * role needs before deciding to tailor. Stored on the listing and handed to
 * the job by Tailor, so it is paid for once.
 */
export async function keyRequirementsAction(_prev: RequirementsState, form: FormData): Promise<RequirementsState> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  if (provider() === "manual") return { error: "In paste mode the requirements are read when you tailor your resume." };
  const listing = await withUser(user.id, (tx) => tx.listing.findFirst({ where: { id, userId: user.id } }));
  if (!listing) return { error: "This role is no longer in the job list." };

  const text = [`${listing.title} at ${listing.company}`, listing.location ? `Location: ${listing.location}` : "", listing.description].filter(Boolean).join("\n\n");
  let parsed;
  try {
    parsed = await parseJob(text);
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (!parsed.isJobPosting) return { error: "The posting could not be read as a single job. Open it on the company's page instead." };
  await withUser(user.id, (tx) => tx.listing.updateMany({ where: { id, userId: user.id }, data: { parsed: parsed as unknown as Prisma.InputJsonValue } }));
  revalidatePath(`/jobs/${id}`);
  return null;
}

/** Asks the worker to check the feed now. */
export async function refreshFeedAction() {
  const user = await requireUser();
  await enqueueFeedSync(user.id);
  revalidatePath("/jobs");
}
