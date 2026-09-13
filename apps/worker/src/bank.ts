import type { Tx } from "@shortlisted/db";
import { BankSchema, type Bank } from "@shortlisted/core";

/** Loads the user's profile and bank rows into the shape the model sees. */
export async function loadBank(tx: Tx, userId: string): Promise<{ bank: Bank; fileNameFormat: string } | null> {
  const profile = await tx.profile.findFirst({ where: { userId } });
  if (!profile) return null;
  const entries = await tx.bankEntry.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
    include: { bullets: { orderBy: { sortOrder: "asc" } } },
  });
  const bank = BankSchema.parse({
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    links: profile.links,
    headline: profile.headline,
    summary: profile.summary,
    skillGroups: profile.skillGroups,
    education: profile.education,
    certifications: profile.certifications,
    entries: entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      organization: e.organization,
      title: e.title,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      url: e.url,
      bullets: e.bullets.map((b) => ({ id: b.id, text: b.text, skills: b.skills, metric: b.metric, inBase: b.inBase })),
    })),
  });
  return { bank, fileNameFormat: profile.fileNameFormat };
}
