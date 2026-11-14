import "server-only";
import { PgBoss } from "pg-boss";

export const GENERATE_QUEUE = "generate";
export const FEED_QUEUE = "feed-sync";

const g = globalThis as unknown as { shortlistedBoss?: Promise<PgBoss> };

async function boss(): Promise<PgBoss> {
  if (!g.shortlistedBoss) {
    g.shortlistedBoss = (async () => {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("DATABASE_URL is not set");
      const b = new PgBoss({ connectionString: url, supervise: false, schedule: false });
      b.on("error", (err: unknown) => console.error("[pg-boss]", err));
      await b.start();
      await b.createQueue(GENERATE_QUEUE);
      await b.createQueue(FEED_QUEUE);
      return b;
    })();
  }
  return g.shortlistedBoss;
}

export async function enqueueGeneration(data: { applicationId: string; userId: string; note?: string | null; force?: boolean }): Promise<void> {
  const b = await boss();
  await b.send(GENERATE_QUEUE, data, { retryLimit: 1, retryDelay: 15, expireInSeconds: 600 });
}

/** Asks the worker to bring the job listings in line with the shared feed. Repeated asks within five minutes collapse into one. */
export async function enqueueFeedSync(userId: string): Promise<void> {
  const b = await boss();
  await b.send(FEED_QUEUE, { userId }, { singletonKey: "feed-sync", singletonSeconds: 300 });
}
