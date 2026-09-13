"use server";

import { revalidatePath } from "next/cache";
import { normalizeSkills, parseCertificationLines, parseEducationLines, type Certification } from "@shortlisted/core";
import { withUser } from "@shortlisted/db";
import { requireUser } from "@/lib/session";

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}
function opt(form: FormData, key: string): string | null {
  const v = str(form, key);
  return v === "" ? null : v;
}

export async function updateProfileAction(form: FormData) {
  const user = await requireUser();
  await withUser(user.id, async (tx) => {
    const current = await tx.profile.findUnique({ where: { userId: user.id }, select: { certifications: true } });
    const existing = (current?.certifications ?? []) as Certification[];
    await tx.profile.update({
      where: { userId: user.id },
      data: {
        fullName: str(form, "fullName"),
        email: str(form, "email"),
        phone: opt(form, "phone"),
        location: opt(form, "location"),
        headline: str(form, "headline"),
        summary: str(form, "summary"),
        fileNameFormat: str(form, "fileNameFormat") || "{name} - {title} - {company}.pdf",
        links: str(form, "links")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((url) => ({ label: url.replace(/^https?:\/\//, "").split("/")[0] ?? url, url })),
        skillGroups: str(form, "skillGroups")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [name, rest] = line.split(":");
            return { name: (name ?? "").trim(), skills: (rest ?? "").split(",").map((s) => s.trim()).filter(Boolean) };
          }),
        education: parseEducationLines(str(form, "education")),
        certifications: parseCertificationLines(str(form, "certifications"), existing),
      },
    });
  });
  revalidatePath("/bank");
}

export async function addEntryAction(form: FormData) {
  const user = await requireUser();
  await withUser(user.id, async (tx) => {
    const count = await tx.bankEntry.count();
    await tx.bankEntry.create({
      data: {
        userId: user.id,
        kind: str(form, "kind") === "PROJECT" ? "PROJECT" : "ROLE",
        organization: str(form, "organization"),
        title: str(form, "title"),
        location: opt(form, "location"),
        startDate: opt(form, "startDate"),
        endDate: opt(form, "endDate"),
        url: opt(form, "url"),
        sortOrder: count,
      },
    });
  });
  revalidatePath("/bank");
}

export async function deleteEntryAction(form: FormData) {
  const user = await requireUser();
  await withUser(user.id, (tx) => tx.bankEntry.delete({ where: { id: str(form, "id") } }));
  revalidatePath("/bank");
}

export async function addBulletAction(form: FormData) {
  const user = await requireUser();
  const entryId = str(form, "entryId");
  await withUser(user.id, async (tx) => {
    const count = await tx.bankBullet.count({ where: { entryId } });
    await tx.bankBullet.create({
      data: {
        userId: user.id,
        entryId,
        text: str(form, "text"),
        skills: normalizeSkills(str(form, "skills").split(",")),
        metric: opt(form, "metric"),
        inBase: form.get("inBase") === "on",
        sortOrder: count,
      },
    });
  });
  revalidatePath("/bank");
}

export async function updateBulletAction(form: FormData) {
  const user = await requireUser();
  await withUser(user.id, (tx) =>
    tx.bankBullet.update({
      where: { id: str(form, "id") },
      data: {
        text: str(form, "text"),
        skills: normalizeSkills(str(form, "skills").split(",")),
        metric: opt(form, "metric"),
        inBase: form.get("inBase") === "on",
      },
    }),
  );
  revalidatePath("/bank");
}

export async function deleteBulletAction(form: FormData) {
  const user = await requireUser();
  await withUser(user.id, (tx) => tx.bankBullet.delete({ where: { id: str(form, "id") } }));
  revalidatePath("/bank");
}
