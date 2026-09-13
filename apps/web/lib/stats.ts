import "server-only";
import { withUser } from "@shortlisted/db";
import { applicationsPerWeek, countPerStage, responseRateByVerdict, type StatsApplication } from "@shortlisted/core";

/** The three dashboard numbers. One query; a single user has hundreds of rows at most. */
export async function dashboardStats(userId: string) {
  const apps = await withUser(userId, (tx) =>
    tx.application.findMany({
      where: { userId },
      select: { id: true, stage: true, fitVerdict: true, stageEvents: { select: { toStage: true, createdAt: true } } },
    }),
  );
  const input: StatsApplication[] = apps.map((a) => ({ id: a.id, stage: a.stage, fitVerdict: a.fitVerdict, events: a.stageEvents }));
  const now = new Date();
  return {
    total: input.length,
    perWeek: applicationsPerWeek(input, now, 8),
    perStage: countPerStage(input),
    byVerdict: responseRateByVerdict(input),
  };
}
