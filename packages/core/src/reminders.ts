import type { StageName } from "./stages.js";

/**
 * The one reminder rule: an application that has sat in Applied with no stage
 * change for ten days needs a follow-up. Rows are created lazily when the
 * board is read (there is no notification channel, so a cron would only do
 * what a page load does) and closed when the stage moves on or the user
 * marks them done.
 */
export const QUIET_AFTER_APPLIED = { rule: "quiet-after-applied-10d", days: 10 } as const;

const DAY_MS = 86_400_000;

export type ReminderCandidate = { rule: string; dueAt: Date };

/** The reminder this application is due, if any, as of `now`. */
export function dueReminderFor(app: { stage: StageName; lastEventAt: Date }, now: Date): ReminderCandidate | null {
  if (app.stage !== "APPLIED") return null;
  const dueAt = new Date(app.lastEventAt.getTime() + QUIET_AFTER_APPLIED.days * DAY_MS);
  if (dueAt.getTime() > now.getTime()) return null;
  return { rule: QUIET_AFTER_APPLIED.rule, dueAt };
}

/** Whole days since the application last changed stage. */
export function quietDays(lastEventAt: Date, now: Date): number {
  return Math.floor((now.getTime() - lastEventAt.getTime()) / DAY_MS);
}
