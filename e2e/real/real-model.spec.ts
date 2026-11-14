import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { chromium, expect, test, type Page } from "@playwright/test";
import { fixture, idFromUrl } from "../helpers.js";
import { REPO } from "../stack.js";

/**
 * The whole automatic path against a REAL model, through a signed-in Claude
 * Code or Codex. Not part of `pnpm e2e`: it spends the subscription's usage
 * and its results vary from run to run, so it checks shape, not wording, and
 * writes what the model actually returned to a report for a person to read.
 *
 * It needs a separate, empty install that shares the sign-in (see
 * e2e/README.md), never the install that holds real data:
 *
 *   E2E_REAL=1 E2E_REAL_URL=http://localhost:3030 \
 *   E2E_REAL_DB=postgresql://postgres:postgres@127.0.0.1:5436/shortlisted \
 *   E2E_REAL_OUT=<folder> pnpm --filter @shortlisted/e2e exec playwright test --project=real
 */

const URL_ = process.env.E2E_REAL_URL ?? "http://localhost:3030";
const DB = process.env.E2E_REAL_DB ?? "postgresql://postgres:postgres@127.0.0.1:5436/shortlisted";
const OUT = process.env.E2E_REAL_OUT ?? path.join(REPO, "e2e", ".tmp", "real");
const MODEL_WAIT = 240_000;

const report: Record<string, unknown> = {};
const note = (key: string, value: unknown) => {
  report[key] = value;
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
};

async function sql<T extends pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  try {
    return (await client.query<T>(text, params)).rows;
  } finally {
    await client.end();
  }
}

type AppRow = { stage: string; generationStatus: string; generationError: string | null; fitVerdict: string | null; fitScore: number | null; covered: string[]; gaps: string[] };
const appRow = async (id: string) => (await sql<AppRow>(`SELECT stage, "generationStatus", "generationError", "fitVerdict", "fitScore", covered, gaps FROM "Application" WHERE id = $1`, [id]))[0]!;

async function settle(id: string): Promise<{ row: AppRow; seconds: number }> {
  const started = Date.now();
  await expect.poll(async () => (await appRow(id)).generationStatus, { timeout: MODEL_WAIT, intervals: [2000] }).toMatch(/^(DONE|SKIPPED|FAILED)$/);
  return { row: await appRow(id), seconds: Math.round((Date.now() - started) / 1000) };
}

async function details(id: string) {
  const [job] = await sql<{ title: string | null; company: string | null; parsed: { mustHaveSkills: string[]; niceToHaveSkills: string[]; seniority: string; isJobPosting: boolean } | null }>(
    `SELECT j.title, j.company, j.parsed FROM "Job" j JOIN "Application" a ON a."jobId" = j.id WHERE a.id = $1`,
    [id],
  );
  const docs = await sql<{ id: string; type: string; version: number; hasFile: boolean; flags: { kind: string; detail: string }[]; selection: Record<string, unknown> }>(
    `SELECT id, type, version, "fileKey" IS NOT NULL AS "hasFile", flags, selection FROM "Document" WHERE "applicationId" = $1 ORDER BY version DESC, type`,
    [id],
  );
  return { job, docs };
}

async function paste(page: Page, text: string): Promise<string> {
  await page.goto(`${URL_}/generate`);
  await page.getByLabel("Posting text").fill(text);
  await page.getByRole("button", { name: "Tailor" }).click();
  await page.waitForURL(/\/applications\//);
  return idFromUrl(page);
}

/** Clicks a button that re-runs the job and waits for the app to accept it, so the old result is not read as the new one. */
async function rerun(page: Page, button: string): Promise<void> {
  const accepted = page.waitForResponse((r) => r.url().includes("/regenerate") && r.request().method() === "POST");
  await page.getByRole("button", { name: button }).click();
  expect((await accepted).status()).toBe(200);
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const LEDGERLY = `Senior Backend Engineer, Payments Ledger
Ledgerly · Remote (Europe, Middle East, South Asia) · Full time

About Ledgerly
Ledgerly builds accounting software for 40,000 small businesses. Our ledger moves real money, so correctness matters more than speed of shipping.

What you will do
- Own the double-entry ledger service and its data model.
- Design multi-currency accounting and month-end reconciliation.
- Review code, mentor two engineers, and take part in an on-call rota.
- Work with product and finance to turn accounting rules into software.

What we are looking for
- 5+ years building backend services in TypeScript on Node.js.
- Deep experience with PostgreSQL: schema design, transactions, row-level security.
- Experience running services in Docker with a CI/CD pipeline.
- You have built or maintained a system where money had to add up.

Nice to have
- Kubernetes.
- AWS or GCP.
- Experience with Prisma or NestJS.

We use GitHub, Linear and Slack. We cannot sponsor visas for this role.`;

const NURSE = `Registered Nurse, Acute Medical Unit
Northwind Hospital · Leeds, United Kingdom · Full time, on site

Requirements
- Current NMC registration as an adult nurse.
- Two years of acute ward experience.
- Venepuncture and cannulation competency.
- Experience with triage and NEWS2 escalation.
- Immediate Life Support certificate.

You will care for up to eight patients per shift, give IV medication, and supervise healthcare assistants.`;

const RECIPE = `Grandma's lentil soup
Rinse 300 grams of red lentils. Fry one chopped onion and two cloves of garlic in olive oil until soft. Add the lentils, a litre of stock, a teaspoon of cumin and a pinch of chilli. Simmer for twenty five minutes, then blend half of it and stir back in. Season with lemon juice and salt. Serve with bread. Keeps for three days in the fridge and freezes well.`;

test("the automatic path with a real model", async ({ page, request }) => {
  test.setTimeout(45 * 60_000);
  mkdirSync(OUT, { recursive: true });
  note("startedAt", new Date().toISOString());

  await test.step("choose the plan in the app and reach the model", async () => {
    await page.goto(`${URL_}/setup`);
    await page.getByRole("radio", { name: /^My Claude plan/ }).click();
    await expect(page.getByText("Claude Code is signed in. Captures run by themselves on your own subscription.")).toBeVisible({ timeout: 60_000 });
    const started = Date.now();
    await page.getByRole("button", { name: "Test it" }).click();
    await expect(page.getByRole("status").filter({ hasText: "It answered." })).toBeVisible({ timeout: 120_000 });
    note("testIt", { seconds: Math.round((Date.now() - started) / 1000) });
  });

  await test.step("import a resume", async () => {
    await page.goto(`${URL_}/onboarding`);
    await page.locator('input[name="resume"]').setInputFiles(fixture("resume.pdf"));
    const started = Date.now();
    await page.getByRole("button", { name: "Import and build my bank" }).click();
    await page.waitForURL(/\/bank$/, { timeout: MODEL_WAIT });
    const [profile] = await sql<{ fullName: string; email: string; phone: string | null; headline: string; summary: string; skillGroups: unknown; education: unknown; certifications: unknown }>(
      `SELECT "fullName", email, phone, headline, summary, "skillGroups", education, certifications FROM "Profile"`,
    );
    const entries = await sql<{ kind: string; organization: string; title: string; startDate: string | null; endDate: string | null; bullets: { text: string; skills: string[]; metric: string | null }[] }>(
      `SELECT e.kind, e.organization, e.title, e."startDate", e."endDate", (SELECT json_agg(json_build_object('text', b.text, 'skills', b.skills, 'metric', b.metric) ORDER BY b."sortOrder") FROM "BankBullet" b WHERE b."entryId" = e.id) AS bullets FROM "BankEntry" e ORDER BY e."sortOrder"`,
    );
    note("import", { seconds: Math.round((Date.now() - started) / 1000), profile, entries });

    expect(profile?.fullName).toBe("Sample Person");
    expect(profile?.email).toBe("sample@example.com");
    const bullets = entries.flatMap((e) => e.bullets ?? []);
    // The resume has seven lines of experience. None may be lost and none invented.
    expect(bullets).toHaveLength(7);
    expect(entries.map((e) => e.organization)).toEqual(expect.arrayContaining(["Acme Payments", "Widget Co"]));
    for (const e of entries) for (const d of [e.startDate, e.endDate]) if (d) expect(d).toMatch(/^\d{4}-\d{2}$/);
    expect(bullets.every((b) => b.skills.length > 0)).toBe(true);
    expect(bullets.some((b) => b.text.includes("40 businesses"))).toBe(true);
    await page.screenshot({ path: path.join(OUT, "1-bank.png"), fullPage: true });
  });

  await test.step("CV check and settings", async () => {
    await page.goto(`${URL_}/bank/check`);
    const score = await page.getByText(/\d+ \/ 100/).first().textContent();
    note("cvCheck", score);
    await page.goto(`${URL_}/settings`);
    await page.getByRole("textbox", { name: /^Job titles/ }).fill("Backend Engineer\nSoftware Engineer");
    await page.getByRole("button", { name: "Save settings" }).click();
    await page.waitForTimeout(1500);
  });

  let listingApp = "";
  await test.step("a real listing: key requirements, then tailor", async () => {
    await page.goto(`${URL_}/jobs?pool=remote&unclear=1&q=typescript&sort=match`);
    const first = page.getByRole("main").getByRole("list").first().getByRole("listitem").first().getByRole("link").first();
    const label = await first.textContent();
    await first.click();
    await page.waitForURL(/\/jobs\/c/);
    const listingId = idFromUrl(page);
    const started = Date.now();
    await page.getByRole("button", { name: "Read the key requirements" }).click();
    await expect(page.getByText(/Must have, \d+ of \d+ in your bank/)).toBeVisible({ timeout: MODEL_WAIT });
    const [listing] = await sql<{ title: string; company: string; parsed: { mustHaveSkills: string[]; niceToHaveSkills: string[] } }>(`SELECT title, company, parsed FROM "Listing" WHERE id = $1`, [listingId]);
    note("keyRequirements", { listing: label, seconds: Math.round((Date.now() - started) / 1000), must: listing?.parsed.mustHaveSkills, nice: listing?.parsed.niceToHaveSkills });
    expect(listing?.parsed.mustHaveSkills.length).toBeGreaterThan(0);
    expect(listing?.parsed.mustHaveSkills.length).toBeLessThanOrEqual(12);
    await page.screenshot({ path: path.join(OUT, "2-job.png"), fullPage: true });

    await page.getByRole("button", { name: "Tailor my resume" }).click();
    await page.waitForURL(/\/applications\//);
    listingApp = idFromUrl(page);
    let result = await settle(listingApp);
    const first_ = { ...result.row, seconds: result.seconds };
    if (result.row.generationStatus === "SKIPPED") {
      await page.reload();
      await rerun(page, "Tailor anyway");
      result = await settle(listingApp);
    }
    const d = await details(listingApp);
    note("tailorFromListing", { first: first_, final: { ...result.row, seconds: result.seconds }, title: d.job?.title, company: d.job?.company, flags: d.docs.map((x) => ({ type: x.type, version: x.version, flags: x.flags })), coverLetter: d.docs.find((x) => x.type === "COVER_LETTER")?.selection.text });
    expect(result.row.generationStatus).toBe("DONE");
    expect(result.row.stage).toBe("GENERATED");
    expect(d.docs.filter((x) => x.hasFile)).toHaveLength(2);
    await page.reload();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, "3-application.png"), fullPage: true });
  });

  let ledgerly = "";
  await test.step("a pasted posting that fits: requirements, fit, documents", async () => {
    ledgerly = await paste(page, LEDGERLY);
    const { row, seconds } = await settle(ledgerly);
    const d = await details(ledgerly);
    const resume = d.docs.find((x) => x.type === "RESUME")!;
    const letter = String(d.docs.find((x) => x.type === "COVER_LETTER")?.selection.text ?? "");
    note("ledgerly", { seconds, row, title: d.job?.title, company: d.job?.company, parsed: d.job?.parsed, resumeFlags: resume.flags, letterFlags: d.docs.find((x) => x.type === "COVER_LETTER")?.flags, letterWords: words(letter), letter, selection: resume.selection });

    expect(row.generationStatus).toBe("DONE");
    expect(d.job?.parsed?.isJobPosting).toBe(true);
    expect(d.job?.company).toMatch(/Ledgerly/i);
    const must = (d.job?.parsed?.mustHaveSkills ?? []).join(" | ");
    expect(d.job?.parsed?.mustHaveSkills.length).toBeLessThanOrEqual(12);
    expect(must).toMatch(/postgres/);
    expect(must).toMatch(/typescript/);
    // Kubernetes is under "Nice to have" and must not be scored as required.
    expect(must).not.toMatch(/kubernetes/);
    expect((d.job?.parsed?.niceToHaveSkills ?? []).join(" | ")).toMatch(/kubernetes/);
    // General duties are not requirements.
    expect(must).not.toMatch(/on-call|code review|mentor/);
    expect(["STRONG", "GOOD"]).toContain(row.fitVerdict);
    expect(letter).toMatch(/Ledgerly/);
    expect(words(letter)).toBeLessThan(220);
    expect(letter).not.toContain("—");

    for (const doc of d.docs) {
      const res = await request.get(`${URL_}/api/documents/${doc.id}/file`);
      expect(res.status()).toBe(200);
      const body = await res.body();
      expect(body.subarray(0, 4).toString()).toBe("%PDF");
      writeFileSync(path.join(OUT, `ledgerly-${doc.type.toLowerCase()}-v${doc.version}.pdf`), body);
    }
  });

  await test.step("regenerate with an instruction", async () => {
    await page.goto(`${URL_}/applications/${ledgerly}`);
    await page.getByLabel("Regenerate instruction").fill("Lead with the ledger work and keep the summary to two sentences");
    await rerun(page, "Regenerate");
    const { row, seconds } = await settle(ledgerly);
    const d = await details(ledgerly);
    const v2 = d.docs.find((x) => x.type === "RESUME" && x.version === 2);
    note("regenerate", { seconds, row, summary: v2?.selection.summary, flags: v2?.flags, firstEntry: (v2?.selection.entries as unknown[] | undefined)?.[0] });
    expect(row.generationStatus).toBe("DONE");
    expect(v2).toBeTruthy();
  });

  await test.step("a poor fit stops, and tailor anyway still tells the truth", async () => {
    const id = await paste(page, NURSE);
    const first = await settle(id);
    note("nurseFirst", { seconds: first.seconds, row: first.row, parsed: (await details(id)).job?.parsed });
    expect(first.row.generationStatus).toBe("SKIPPED");
    expect(first.row.fitVerdict).toBe("POOR");
    expect((await details(id)).docs).toHaveLength(0);

    await page.reload();
    await rerun(page, "Tailor anyway");
    const second = await settle(id);
    const d = await details(id);
    const letter = String(d.docs.find((x) => x.type === "COVER_LETTER")?.selection.text ?? "");
    note("nurseAnyway", { seconds: second.seconds, row: second.row, flags: d.docs.map((x) => ({ type: x.type, flags: x.flags })), letter, headline: d.docs.find((x) => x.type === "RESUME")?.selection.headline });
    expect(second.row.generationStatus).toBe("DONE");
    expect(second.row.fitVerdict).toBe("POOR");
  });

  await test.step("a page that is not a job is refused", async () => {
    const id = await paste(page, RECIPE);
    const { row, seconds } = await settle(id);
    note("recipe", { seconds, row });
    expect(row.generationStatus).toBe("FAILED");
    expect(row.generationError).toContain("does not look like a single job posting");
  });

  await test.step("the board after all of that", async () => {
    await page.goto(`${URL_}/board`);
    await page.screenshot({ path: path.join(OUT, "4-board.png"), fullPage: true });
  });

  await test.step("the extension, with the real model", async () => {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Platform Engineer - Quillfeather</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Platform Engineer","hiringOrganization":{"@type":"Organization","name":"Quillfeather"},"jobLocationType":"TELECOMMUTE","datePosted":"2026-11-10","description":"<p>Quillfeather is hiring a Platform Engineer.</p>"}</script></head>
<body><main><h1>Platform Engineer</h1><p>Quillfeather · Remote</p>
<p>Quillfeather runs a publishing platform for 2,000 newsrooms. You will own our deploy pipeline and the services behind it.</p>
<h2>Requirements</h2><ul><li>Docker and a CI/CD system such as GitHub Actions</li><li>TypeScript or Go</li><li>PostgreSQL in production</li></ul>
<h2>Bonus</h2><ul><li>Terraform</li><li>Kubernetes</li></ul>
<form id="apply"><label>Resume <input type="file" name="resume" id="resume" accept=".pdf"></label><label>Cover letter <textarea name="cover_letter" id="cover" rows="6"></textarea></label><button type="button">Submit</button></form></main></body></html>`;
    const server = createServer((_req, res) => {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(html);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const jobUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/careers/platform-engineer`;
    const EXT = path.join(REPO, "apps", "extension", "dist");
    const ext = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, viewport: { width: 1000, height: 800 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
    try {
      const worker = ext.serviceWorkers()[0] ?? (await ext.waitForEvent("serviceworker"));
      const extensionId = new URL(worker.url()).host;
      const job = ext.pages()[0] ?? (await ext.newPage());
      await job.goto(jobUrl);
      const panel = await ext.newPage();
      await job.bringToFront();
      await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      await panel.evaluate((apiBase) => chrome.storage.local.set({ apiBase }), URL_);
      await job.bringToFront();
      await panel.reload();
      const press = (selector: string) => panel.locator(selector).dispatchEvent("click");
      await expect(panel.locator("#ready")).toBeVisible();
      const started = Date.now();
      await press("#capture");
      await expect(panel.locator("#attach")).toBeEnabled({ timeout: MODEL_WAIT });
      const seconds = Math.round((Date.now() - started) / 1000);
      await press("#attach");
      await expect(panel.locator("#status")).toHaveText("Resume attached and cover letter filled.", { timeout: 30_000 });
      const form = await job.evaluate(() => {
        const file = (document.getElementById("resume") as HTMLInputElement).files?.[0];
        return { name: file?.name ?? null, size: file?.size ?? 0, cover: (document.getElementById("cover") as HTMLTextAreaElement).value };
      });
      const [row] = await sql<{ id: string }>(`SELECT a.id FROM "Application" a JOIN "Job" j ON j.id = a."jobId" WHERE j.url = $1`, [jobUrl]);
      note("extension", { seconds, form: { ...form, cover: form.cover.slice(0, 600) }, row: await appRow(row!.id), parsed: (await details(row!.id)).job?.parsed });
      expect(form.name).toMatch(/Platform Engineer.*Quillfeather\.pdf$/);
      expect(form.size).toBeGreaterThan(5000);
      expect(form.cover).toMatch(/Quillfeather/);
      await panel.screenshot({ path: path.join(OUT, "5-panel.png"), fullPage: true });
    } finally {
      await ext.close();
      server.close();
    }
  });

  note("finishedAt", new Date().toISOString());
});
