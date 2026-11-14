import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { expect, type Page } from "@playwright/test";
import { FIXTURES, STACKS, TMP, type StackName } from "./stack.js";

export const fixture = (name: string) => path.join(FIXTURES, name);
export const fixtureText = (name: string) => readFileSync(fixture(name), "utf8");

/** Runs SQL against a stack's test database. Used to read what the app stored and to move dates back. */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(stack: StackName, text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: STACKS[stack].databaseUrl });
  await client.connect();
  try {
    return (await client.query<T>(text, params)).rows;
  } finally {
    await client.end();
  }
}

/** Writes the page's accessibility tree to e2e/.tmp/dump, for writing new tests. */
export async function dump(page: Page, name: string): Promise<void> {
  mkdirSync(path.join(TMP, "dump"), { recursive: true });
  writeFileSync(path.join(TMP, "dump", `${name}.txt`), `URL ${page.url()}\n${await page.locator("body").ariaSnapshot()}`);
}

/** The id at the end of an /applications/:id or /jobs/:id address. */
export function idFromUrl(page: Page): string {
  const id = new URL(page.url()).pathname.split("/").pop();
  if (!id) throw new Error(`no id in ${page.url()}`);
  return id;
}

/** A posting the stand-in tool and the paste form both accept. The token keeps each one unique. */
export function posting(opts: { title: string; company: string; location?: string; must: string[]; nice?: string[]; extra?: string }): string {
  const token = Math.random().toString(36).slice(2, 10);
  return [
    `Title: ${opts.title}`,
    `Company: ${opts.company}`,
    `Location: ${opts.location ?? "Remote"}`,
    "",
    `${opts.company} is hiring a ${opts.title}. You will own the service, design the data model and mentor engineers.`,
    `Must have: ${opts.must.join(", ")}.`,
    opts.nice?.length ? `Nice to have: ${opts.nice.join(", ")}.` : "",
    opts.extra ?? "",
    `Requisition ${token}.`,
  ].join("\n");
}

/** Waits until the application page shows the finished documents. */
export async function waitForDocuments(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: /^Resume v\d+$/ })).toBeVisible({ timeout: 45_000 });
}

/** Asks the stack's worker to read the feed now. The app's own button collapses repeated asks within five minutes. */
export async function runFeedSync(stack: StackName): Promise<void> {
  const boss = new PgBoss({ connectionString: STACKS[stack].databaseUrl, supervise: false, schedule: false });
  await boss.start();
  try {
    await boss.send("feed-sync", {});
  } finally {
    await boss.stop({ graceful: false });
  }
}
