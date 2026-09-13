import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import path from "node:path";

export const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

const rootEnv = path.join(REPO_ROOT, ".env");
if (existsSync(rootEnv)) loadEnvFile(rootEnv);
