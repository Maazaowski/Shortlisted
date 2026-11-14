import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The end-to-end tests run against two throwaway copies of the app, each with
 * its own database, its own files folder and its own port, so nothing here
 * ever touches the real data.
 *
 *   manual  paste mode: the prompt is copied out and a reply is pasted back.
 *   cli     the automatic path, with a stand-in for Claude Code (fake-cli/)
 *           that answers the three prompts from fixed rules.
 */

export const HERE = import.meta.dirname;
export const REPO = path.resolve(HERE, "..");
export const TMP = path.join(HERE, ".tmp");
export const FEED_DIR = path.join(TMP, "feed");
export const FIXTURES = path.join(HERE, "fixtures");

const rootEnv = path.join(REPO, ".env");
if (existsSync(rootEnv)) {
  // Values already in the environment win over the file.
  process.loadEnvFile(rootEnv);
}

/** The Postgres server the test databases are created on. Defaults to the Compose database. */
const BASE_DB = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5434/shortlisted";

function databaseUrl(name: string): string {
  const url = new URL(BASE_DB);
  url.pathname = `/${name}`;
  return url.toString();
}

/** A connection to the server itself, for creating and dropping the test databases. */
export const ADMIN_DB = databaseUrl("postgres");

export type StackName = "manual" | "cli";

export type Stack = {
  name: StackName;
  port: number;
  url: string;
  database: string;
  databaseUrl: string;
  storageDir: string;
  env: Record<string, string>;
};

const FAKE_CLI = path.join(HERE, "fake-cli", process.platform === "win32" ? "claude.cmd" : "claude");

function stack(name: StackName, port: number, extra: Record<string, string>): Stack {
  const database = `shortlisted_e2e_${name}`;
  const storageDir = path.join(TMP, name, "files");
  return {
    name,
    port,
    url: `http://localhost:${port}`,
    database,
    databaseUrl: databaseUrl(database),
    storageDir,
    env: {
      DATABASE_URL: databaseUrl(database),
      STORAGE_DIR: storageDir,
      SHORTLISTED_FEED_URL: pathToFileURL(FEED_DIR).toString(),
      SHORTLISTED_UPDATE_CHECK: "off",
      SHORTLISTED_VERSION: "dev",
      ANTHROPIC_API_KEY: "",
      PORT: String(port),
      ...extra,
    },
  };
}

export const STACKS: Record<StackName, Stack> = {
  manual: stack("manual", Number(process.env.E2E_MANUAL_PORT) || 3041, { SHORTLISTED_PROVIDER: "manual" }),
  cli: stack("cli", Number(process.env.E2E_CLI_PORT) || 3042, {
    SHORTLISTED_PROVIDER: "claude-cli",
    CLAUDE_BIN: FAKE_CLI,
    SHORTLISTED_CLI_TIMEOUT_MS: "20000",
  }),
};
