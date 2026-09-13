"use server";

import { redirect } from "next/navigation";
import { buildImportPrompt, importBankFromResume, ManualReplyError, newCertificationId, normalizeSkills, parseImportReply, provider, type ImportedBank } from "@shortlisted/core";
import { withUser } from "@shortlisted/db";
import { requireUser } from "@/lib/session";
import { RESUME_MAX_BYTES, ResumeReadError, resumeText } from "@/lib/resume-text";

/**
 * With the Anthropic provider the import is one step. With the manual
 * provider the action returns the prompt instead, the user pastes it into
 * Claude, and importReplyAction takes the JSON back.
 */
export type ImportState = { error?: string; prompt?: string } | null;

/**
 * Onboarding step 2: an existing resume (PDF or .docx) becomes the first draft of the bank.
 * The only time the model writes into the bank. Replaces any existing entries.
 */
export async function importResumeAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const user = await requireUser();
  const file = form.get("resume");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF or Word document first." };
  if (file.size > RESUME_MAX_BYTES) return { error: "That file is over 5 MB." };

  let text: string;
  try {
    text = await resumeText(file);
  } catch (err) {
    if (err instanceof ResumeReadError) return { error: err.message };
    throw err;
  }

  if (provider() === "manual") return { prompt: buildImportPrompt(text) };

  let imported: ImportedBank;
  try {
    imported = await importBankFromResume(text);
  } catch (err) {
    return { error: `Could not read the resume: ${(err as Error).message}` };
  }

  await writeImportedBank(user.id, imported);
  redirect("/bank");
}

/** Manual provider, step two: the pasted reply becomes the bank. */
export async function importReplyAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const user = await requireUser();
  const text = String(form.get("reply") ?? "");
  const prompt = String(form.get("prompt") ?? "");
  let imported: ImportedBank;
  try {
    imported = parseImportReply(text);
  } catch (err) {
    if (err instanceof ManualReplyError) return { prompt, error: err.message };
    throw err;
  }
  await writeImportedBank(user.id, imported);
  redirect("/bank");
}

async function writeImportedBank(userId: string, imported: ImportedBank): Promise<void> {
  const profileFields = {
    fullName: imported.fullName || "Your name",
    email: imported.email || "",
    phone: imported.phone,
    location: imported.location,
    links: imported.links,
    headline: imported.headline,
    summary: imported.summary,
    skillGroups: imported.skillGroups.map((g) => ({ name: g.name, skills: g.skills })),
    education: imported.education,
    certifications: imported.certifications.map((c) => ({ id: newCertificationId(), ...c })),
  };

  await withUser(userId, async (tx) => {
    await tx.profile.upsert({
      where: { userId },
      create: { userId, ...profileFields },
      update: profileFields,
    });
    await tx.bankEntry.deleteMany({ where: { userId } });
    let order = 0;
    for (const e of imported.entries) {
      await tx.bankEntry.create({
        data: {
          userId,
          kind: e.kind,
          organization: e.organization,
          title: e.title,
          location: e.location,
          startDate: e.startDate,
          endDate: e.endDate,
          url: e.url,
          sortOrder: order++,
          bullets: {
            create: e.bullets.map((b, i) => ({
              userId,
              text: b.text,
              skills: normalizeSkills(b.skills),
              metric: b.metric,
              sortOrder: i,
            })),
          },
        },
      });
    }
  });
}
