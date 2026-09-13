import "server-only";
import path from "node:path";
import { storageFromEnv } from "@shortlisted/core";

export const REPO_ROOT = path.resolve(process.cwd(), "../..");
export const storage = storageFromEnv(REPO_ROOT);
