import "./env.js";
import { PgBoss, type JobWithMetadata } from "pg-boss";
import { runGeneration, type GenerateJob } from "./pipeline.js";

export const GENERATE_QUEUE = "generate";

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

  console.log("Worker listening on queue", GENERATE_QUEUE);

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
