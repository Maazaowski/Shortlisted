import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { ADMIN_DB, FEED_DIR, REPO, STACKS, TMP, type Stack } from "./stack.js";

/**
 * Before any test: build the app once, make two empty databases, write the
 * fixture job feed, and start a web server and a worker for each. The function
 * returned at the end stops them again.
 *
 * E2E_SKIP_BUILD=1 reuses the last build.
 */

const log = (...a: unknown[]) => console.log("[e2e]", ...a);

function run(command: string, env: Record<string, string> = {}): void {
  const result = spawnSync(command, { cwd: REPO, shell: true, stdio: "inherit", env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`"${command}" failed with exit code ${result.status}`);
}

async function resetDatabase(stack: Stack): Promise<void> {
  const client = new pg.Client({ connectionString: ADMIN_DB });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${stack.database}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${stack.database}"`);
  } finally {
    await client.end();
  }
  run("pnpm --filter @shortlisted/db exec prisma migrate deploy", { DATABASE_URL: stack.databaseUrl });
}

function start(name: string, command: string, env: Record<string, string>): ChildProcess {
  const out = createWriteStream(path.join(TMP, "logs", `${name}.log`));
  const child = spawn(command, { cwd: REPO, shell: true, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
  return child;
}

function stop(child: ChildProcess): void {
  if (!child.pid) return;
  // The shell is the parent of the real process, so the whole tree goes.
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

async function waitFor(what: string, check: () => Promise<boolean>, seconds: number): Promise<void> {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    if (await check().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${what} did not come up within ${seconds} seconds. See e2e/.tmp/logs.`);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(path.join(TMP, "logs"), { recursive: true });

  if (process.env.E2E_SKIP_BUILD !== "1") {
    log("building web, worker and extension");
    run("pnpm turbo run build --filter=@shortlisted/web --filter=@shortlisted/worker --filter=@shortlisted/extension");
  }

  // Imported here, not at the top, because it needs the build above.
  const { writeFeed } = await import("./feed-fixture.js");
  const listings = writeFeed(FEED_DIR);
  log(`fixture feed: ${listings.length} listings`);

  const children: ChildProcess[] = [];
  const stacks = Object.values(STACKS);
  for (const stack of stacks) {
    log(`${stack.name}: database ${stack.database}, web on ${stack.url}`);
    await resetDatabase(stack);
    mkdirSync(stack.storageDir, { recursive: true });
    children.push(start(`${stack.name}-web`, `pnpm --filter @shortlisted/web exec next start -p ${stack.port}`, stack.env));
    children.push(start(`${stack.name}-worker`, "node apps/worker/dist/index.js", stack.env));
  }

  const teardown = async () => {
    for (const child of children) stop(child);
  };

  try {
    for (const stack of stacks) {
      await waitFor(`${stack.name} web`, async () => (await fetch(`${stack.url}/api/me`)).ok, 90);
      // The worker syncs the feed once on start; the tests need it finished.
      await waitFor(
        `${stack.name} feed sync`,
        async () => {
          const client = new pg.Client({ connectionString: stack.databaseUrl });
          await client.connect();
          try {
            const { rows } = await client.query(`SELECT count(*)::int AS n FROM "Listing"`);
            return rows[0].n >= listings.length;
          } finally {
            await client.end();
          }
        },
        60,
      );
    }
  } catch (err) {
    await teardown();
    throw err;
  }
  log("ready");
  return teardown;
}
