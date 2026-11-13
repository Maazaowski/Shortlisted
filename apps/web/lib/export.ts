import "server-only";
import { withUser } from "@shortlisted/db";
import { STAGE_LABEL } from "@shortlisted/core";
import { VERSION } from "./version";

/**
 * Everything this install holds for the user, because the only copy is on
 * their machine. The JSON is the whole record minus the PDFs (which can be
 * rendered again from the selections) and minus the feed's listings (which
 * can be downloaded again), except the ones the user saved. The CSV is one
 * row per application, for a spreadsheet.
 */
export async function exportData(userId: string) {
  return withUser(userId, async (tx) => {
    const [profile, preferences, entries, jobs, applications, listings] = await Promise.all([
      tx.profile.findUnique({ where: { userId } }),
      tx.preferences.findUnique({ where: { userId } }),
      tx.bankEntry.findMany({ where: { userId }, orderBy: { sortOrder: "asc" }, include: { bullets: { orderBy: { sortOrder: "asc" } } } }),
      tx.job.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      tx.application.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        include: { stageEvents: { orderBy: { createdAt: "asc" } }, notes: { orderBy: { createdAt: "asc" } }, reminders: true, documents: { orderBy: { version: "asc" } } },
      }),
      tx.listing.findMany({ where: { userId, OR: [{ savedAt: { not: null } }, { applicationId: { not: null } }] }, orderBy: { savedAt: "asc" } }),
    ]);
    return { exportedAt: new Date().toISOString(), version: VERSION, profile, preferences, bank: entries, jobs, applications, savedListings: listings };
  });
}

function cell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  // A cell that starts with =, +, - or @ is run as a formula by spreadsheets. A leading quote keeps it text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export async function exportCsv(userId: string): Promise<string> {
  const apps = await withUser(userId, (tx) =>
    tx.application.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { job: true, stageEvents: { orderBy: { createdAt: "asc" } }, notes: { orderBy: { createdAt: "asc" } } },
    }),
  );
  const header = ["Company", "Role", "Link", "Stage", "Fit", "Fit score", "Captured", "Applied", "Last change", "Interview", "Apply by", "Contact", "Contact email", "Contact link", "Rejection reason", "Notes"];
  const rows = apps.map((a) => [
    a.job.company,
    a.job.title,
    a.job.url,
    STAGE_LABEL[a.stage],
    a.fitVerdict,
    a.fitScore,
    day(a.createdAt),
    day(a.stageEvents.find((e) => e.toStage === "APPLIED")?.createdAt),
    day(a.stageEvents.at(-1)?.createdAt ?? a.createdAt),
    day(a.interviewAt),
    day(a.deadlineAt),
    a.contactName,
    a.contactEmail,
    a.contactUrl,
    a.rejectionReason,
    a.notes.map((n) => `${day(n.createdAt)}: ${n.body}`).join("\n"),
  ]);
  // The byte order mark makes Excel read the file as UTF-8.
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
