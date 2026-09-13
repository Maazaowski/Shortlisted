import "server-only";
import { withUser } from "@shortlisted/db";
import { dueReminderFor, quietDays } from "@shortlisted/core";

export type OpenReminder = {
  id: string;
  applicationId: string;
  title: string | null;
  company: string | null;
  rule: string;
  dueAt: string;
  quietDays: number;
};

/**
 * Creates the reminder rows that are due right now. Idempotent: the unique
 * (applicationId, rule) index makes a second sync a no-op. Called when the
 * board is read, which is the only time anyone would see a reminder anyway.
 */
export async function syncReminders(userId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    const apps = await tx.application.findMany({
      where: { userId, stage: "APPLIED" },
      include: { stageEvents: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const now = new Date();
    const rows = [];
    for (const a of apps) {
      const due = dueReminderFor({ stage: a.stage, lastEventAt: a.stageEvents[0]?.createdAt ?? a.updatedAt }, now);
      if (due) rows.push({ userId, applicationId: a.id, rule: due.rule, dueAt: due.dueAt });
    }
    if (rows.length > 0) await tx.reminder.createMany({ data: rows, skipDuplicates: true });
  });
}

export async function listOpenReminders(userId: string): Promise<OpenReminder[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx.reminder.findMany({
      where: { userId, doneAt: null },
      orderBy: { dueAt: "asc" },
      include: { application: { include: { job: true, stageEvents: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    });
    const now = new Date();
    return rows.map((r) => ({
      id: r.id,
      applicationId: r.applicationId,
      title: r.application.job.title,
      company: r.application.job.company,
      rule: r.rule,
      dueAt: r.dueAt.toISOString(),
      quietDays: quietDays(r.application.stageEvents[0]?.createdAt ?? r.application.updatedAt, now),
    }));
  });
}

/** Marks a reminder done. Returns the application it belonged to, or null if there was no such open reminder. */
export async function completeReminder(userId: string, id: string): Promise<string | null> {
  return withUser(userId, async (tx) => {
    const r = await tx.reminder.findFirst({ where: { id, userId } });
    if (!r) return null;
    if (!r.doneAt) await tx.reminder.update({ where: { id }, data: { doneAt: new Date() } });
    return r.applicationId;
  });
}
