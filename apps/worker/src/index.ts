import "./env.js";
import { PgBoss, type JobWithMetadata } from "pg-boss";
import { LOCAL_USER_ID } from "@shortlisted/db";
import { runGeneration, type GenerateJob } from "./pipeline.js";
import { syncFeed } from "./feed-sync.js";

export const GENERATE_QUEUE = "generate";
export const FEED_QUEUE = "feed-sync";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const boss = new PgBoss({ connectionString: url });
  boss.on("error", (err) => console.error("[pg-boss]", err));
  await boss.start();
  await boss.createQueue(GENERATE_QUEUE);

  // Errors propagate so pg-boss honours the retryLimit the producer set.
  // runGeneration has already written FAILED to the application by then.
  await boss.work(GENERATE_QUEUE, { batchSize: 1, includeMetadata: true }, async (jobs: JobWithMetadata<GenerateJob>[]) => {
    for (const job of jobs) {
      const started = Date.now();
      console.log(`[generate] start ${job.data.applicationId} (attempt ${job.retryCount + 1})`);
      try {
        await runGeneration(job.data);
        console.log(`[generate] done ${job.data.applicationId} in ${Math.round((Date.now() - started) / 1000)}s`);
      } catch (err) {
        console.error(`[generate] failed ${job.data.applicationId}:`, (err as Error).message);
        throw err;
      }
    }
  });

  // The job feed is rebuilt once a day. Checking every six hours, and once at
  // start, keeps a machine that was off overnight from waiting a day. The jobs
  // page also asks for a sync when the last one is old (apps/web/lib/queue.ts).
  await boss.createQueue(FEED_QUEUE);
  await boss.work(FEED_QUEUE, { batchSize: 1 }, async (jobs: { data: { userId?: string } }[]) => {
    for (const job of jobs) {
      const result = await syncFeed(job.data?.userId ?? LOCAL_USER_ID);
      if (result) console.log(`[feed-sync] ${result.total} listings: ${result.added} new, ${result.changed} changed, ${result.closed} closed`);
    }
  });
  await boss.schedule(FEED_QUEUE, "20 */6 * * *", { userId: LOCAL_USER_ID });
  await boss.send(FEED_QUEUE, { userId: LOCAL_USER_ID }, { singletonKey: "feed-sync", singletonSeconds: 300 });

  console.log("Worker listening on queues", GENERATE_QUEUE, FEED_QUEUE);

  const stop = async () => {
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
