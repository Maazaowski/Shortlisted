// Runs a prisma CLI command with the root .env loaded. The Prisma CLI only
// reads .env from its own directory, and this repo keeps one at the root.
import { spawnSync } from "node:child_process";
import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import path from "node:path";

const rootEnv = path.resolve(import.meta.dirname, "../../../.env");
if (existsSync(rootEnv)) loadEnvFile(rootEnv);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL must be set in the root .env");
  process.exit(1);
}

const result = spawnSync("pnpm", ["exec", "prisma", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
  shell: true,
  cwd: path.resolve(import.meta.dirname, ".."),
});

process.exit(result.status ?? 1);
