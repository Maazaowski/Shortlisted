import type { Verdict } from "./fit.js";
import { STAGES, type StageName } from "./stages.js";

/** The slice of an application the dashboard needs. Plain data so the maths is testable without a database. */
export type StatsApplication = {
  id: string;
  stage: StageName;
  fitVerdict: Verdict | null;
  events: { toStage: StageName; createdAt: Date }[];
};

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Monday 00:00 UTC of the week containing `d`. */
export function weekStart(d: Date): Date {
  const day = d.getUTCDay(); // 0 Sunday .. 6 Saturday
  const back = (day + 6) % 7; // days since Monday
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
}

export type WeekCount = { weekStart: string; count: number };

/**
 * Applications marked Applied per week, oldest first, zero-filled, for the
 * last `weeks` weeks ending in the week containing `now`. An application
 * counts in the week of its first Applied event.
 */
export function applicationsPerWeek(apps: StatsApplication[], now: Date, weeks = 8): WeekCount[] {
  const last = weekStart(now);
  const first = new Date(last.getTime() - (weeks - 1) * WEEK_MS);
  const counts = new Map<number, number>();
  for (let i = 0; i < weeks; i++) counts.set(first.getTime() + i * WEEK_MS, 0);
  for (const app of apps) {
    const appliedAt = firstEvent(app, "APPLIED");
    if (!appliedAt) continue;
    const key = weekStart(appliedAt).getTime();
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([ms, count]) => ({ weekStart: new Date(ms).toISOString().slice(0, 10), count }));
}

export function countPerStage(apps: StatsApplication[]): Record<StageName, number> {
  const out = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<StageName, number>;
  for (const app of apps) out[app.stage] += 1;
  return out;
}

export type VerdictResponse = { applied: number; responded: number; rate: number | null };

const VERDICTS: Verdict[] = ["STRONG", "GOOD", "POSSIBLE", "POOR"];
const RESPONSE_STAGES: StageName[] = ["SCREENING", "INTERVIEW", "OFFER"];

/**
 * Of the applications with a given fit verdict that were marked Applied, how
 * many later reached Screening, Interview or Offer. A rejection with no
 * screening is not a response: the question is whether the resume got a
 * conversation, not whether the company answered. Rate is null with nothing applied.
 */
export function responseRateByVerdict(apps: StatsApplication[]): Record<Verdict, VerdictResponse> {
  const out = Object.fromEntries(VERDICTS.map((v) => [v, { applied: 0, responded: 0, rate: null }])) as Record<Verdict, VerdictResponse>;
  for (const app of apps) {
    if (!app.fitVerdict) continue;
    const appliedAt = firstEvent(app, "APPLIED");
    if (!appliedAt) continue;
    const bucket = out[app.fitVerdict];
    bucket.applied += 1;
    const responded = app.events.some((e) => RESPONSE_STAGES.includes(e.toStage) && e.createdAt.getTime() >= appliedAt.getTime());
    if (responded) bucket.responded += 1;
  }
  for (const v of VERDICTS) {
    const b = out[v];
    b.rate = b.applied === 0 ? null : b.responded / b.applied;
  }
  return out;
}

function firstEvent(app: StatsApplication, stage: StageName): Date | null {
  let first: Date | null = null;
  for (const e of app.events) {
    if (e.toStage !== stage) continue;
    if (!first || e.createdAt.getTime() < first.getTime()) first = e.createdAt;
  }
  return first;
}
