import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import path from "node:path";

// One .env at the repo root for every app. Next only reads its own directory,
// so load the root file before anything else runs.
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  agentRules: false,
  serverExternalPackages: ["@prisma/client", "@shortlisted/db", "@shortlisted/core", "pg-boss", "unpdf", "mammoth"],
};

export default nextConfig;
