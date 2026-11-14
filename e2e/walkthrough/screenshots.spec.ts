import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium, expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { fixture, fixtureText, idFromUrl, posting, sql } from "../helpers.js";
import { REPO, STACKS } from "../stack.js";

/**
 * Takes the screenshots the README uses, from the two test stacks with sample
 * data. Not a test. Run it with:
 *
 *   E2E_WALKTHROUGH=1 pnpm --filter @shortlisted/e2e exec playwright test --project=walkthrough screenshots
 */

const OUT = path.join(REPO, "docs", "screenshots");
const AUTO = STACKS.cli.url;
const PASTE = STACKS.manual.url;
const SIZE = { width: 1280, height: 800 };

async function shot(page: Page, name: string, opts: { top?: Parameters<Page["locator"]>[0]; offset?: number } = {}): Promise<void> {
  if (opts.top) {
    await page.locator(opts.top).first().evaluate((el, offset) => {
      const y = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(0, y) });
    }, opts.offset ?? 90);
  } else {
    await page.evaluate(() => window.scrollTo({ top: 0 }));
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: "disabled" });
}

async function tailor(page: Page, text: string): Promise<string> {
  await page.goto(`${AUTO}/generate`);
  await page.getByLabel("Posting text").fill(text);
  await page.getByRole("button", { name: "Tailor" }).click();
  await page.waitForURL(/\/applications\//);
  const id = idFromUrl(page);
  await expect.poll(async () => (await sql<{ generationStatus: string }>("cli", `SELECT "generationStatus" FROM "Application" WHERE id = $1`, [id]))[0]?.generationStatus, { timeout: 60_000 }).toMatch(/DONE|SKIPPED/);
  return id;
}

const stage = (request: APIRequestContext, id: string, to: string, note?: string) => request.post(`${AUTO}/api/applications/${id}/stage`, { data: { stage: to, note: note ?? null } });

/** Moves an application's whole history back, so the dashboard has more than one week on it. */
const backdate = (id: string, days: number) => sql("cli", `UPDATE "StageEvent" SET "createdAt" = "createdAt" - make_interval(days => $2) WHERE "applicationId" = $1`, [id, days]);

test("take the README screenshots", async ({ browser, request }) => {
  test.setTimeout(15 * 60_000);
  const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1.5, reducedMotion: "reduce" });
  const page = await context.newPage();

  // ---- an empty install
  await page.goto(`${AUTO}/setup`);
  await shot(page, "setup");
  await page.goto(`${AUTO}/onboarding`);
  await page.locator('input[name="resume"]').setInputFiles(fixture("resume.pdf"));
  await shot(page, "import");
  await page.getByRole("button", { name: "Import and build my bank" }).click();
  await page.waitForURL(/\/bank$/, { timeout: 30_000 });

  // ---- bank and CV check
  await shot(page, "bank");
  await page.goto(`${AUTO}/bank/check`);
  await shot(page, "cv-check");

  // ---- settings
  await page.goto(`${AUTO}/settings`);
  await page.getByRole("textbox", { name: /^Job titles/ }).fill("Backend Engineer\nPlatform Engineer");
  await page.getByLabel(/Applications per week/).fill("5");
  await page.getByRole("checkbox", { name: "Software Engineering" }).check();
  await page.getByRole("checkbox", { name: "DevOps & Cloud" }).check();
  await shot(page, "settings");
  await page.getByRole("checkbox", { name: "Software Engineering" }).uncheck();
  await page.getByRole("checkbox", { name: "DevOps & Cloud" }).uncheck();
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.waitForTimeout(1200);

  // ---- jobs
  await page.goto(`${AUTO}/jobs?pool=remote&unclear=1&sort=match`);
  await shot(page, "jobs");
  await page.goto(`${AUTO}/jobs?pool=relocate`);
  await page.getByRole("link", { name: /Platform Engineer/ }).click();
  await page.waitForURL(/\/jobs\/c/);
  await page.getByRole("button", { name: "Read the key requirements" }).click();
  await expect(page.getByText(/Must have, \d of \d in your bank/)).toBeVisible({ timeout: 30_000 });
  await shot(page, "job");

  // ---- one application in full
  await page.goto(`${AUTO}/jobs`);
  await page.getByRole("link", { name: /Senior Backend Engineer/ }).click();
  await page.waitForURL(/\/jobs\/c/);
  await page.getByRole("button", { name: "Tailor my resume" }).click();
  await page.waitForURL(/\/applications\//);
  const main = idFromUrl(page);
  await expect(page.getByRole("heading", { name: /^Resume v\d+$/ })).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2500);
  await shot(page, "application");
  await shot(page, "resume", { top: 'iframe[title="Resume preview"]', offset: 130 });

  await page.getByRole("button", { name: "Edit" }).click();
  const letter = page.getByLabel("Cover letter text");
  await letter.fill((await letter.inputValue()) + "\n\nAt Globex I grew revenue by 250% on Kubernetes.");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText("Check these before you send")).toBeVisible({ timeout: 30_000 });
  await shot(page, "cover-letter-flags", { top: "text=Cover letter >> nth=0", offset: 110 });

  await page.getByRole("button", { name: "Mark Applied" }).click();
  await expect(page.getByRole("button", { name: "Mark Screening" })).toBeVisible();
  await page.getByLabel("Contact name").fill("Dana Whitfield");
  await page.getByLabel("Contact email").fill("dana@ledgerly.example");
  await page.getByLabel("Interview").fill("2026-11-20");
  await page.getByLabel("Apply by").fill("2026-11-30");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByLabel("New note").fill("Recruiter said the range is 90 to 110k");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(800);
  await shot(page, "messages", { top: "#messages, h2:has-text('Messages to send')", offset: 110 });

  // ---- more applications, so the board and the dashboard have something on them
  const made: Record<string, string> = {};
  for (const [key, p] of Object.entries({
    kranz: posting({ title: "Platform Engineer", company: "Kranz Mobility", location: "Berlin, Germany", must: ["Docker", "AWS", "Postgres"], nice: ["Kubernetes"] }),
    fennel: posting({ title: "Ledger Engineer", company: "Fennel Finance", must: ["Postgres", "TypeScript"] }),
    orbit: posting({ title: "Full Stack Engineer", company: "Orbit Labs", must: ["React", "Next", "TypeScript", "Postgres"] }),
    tally: posting({ title: "Backend Engineer", company: "Tallyworks", must: ["Node", "Postgres", "Kafka", "Go"] }),
    harbor: posting({ title: "Senior Engineer, Payments", company: "Harborline", must: ["Postgres", "TypeScript", "Node"] }),
    nurse: posting({ title: "Registered Nurse", company: "Northwind Hospital", location: "Leeds", must: ["Nursing", "Phlebotomy", "Triage", "Patient care"] }),
  })) {
    made[key] = await tailor(page, p);
  }
  await stage(request, made.kranz!, "APPLIED");
  await stage(request, made.kranz!, "SCREENING");
  await stage(request, made.fennel!, "APPLIED");
  await stage(request, made.fennel!, "INTERVIEW");
  await stage(request, made.orbit!, "APPLIED");
  await stage(request, made.orbit!, "REJECTED", "Went with an internal candidate");
  await stage(request, made.harbor!, "APPLIED");
  await stage(request, made.harbor!, "OFFER");
  await backdate(made.kranz!, 9);
  await backdate(made.fennel!, 16);
  await backdate(made.orbit!, 23);
  await backdate(made.harbor!, 30);
  await backdate(main, 11);

  await page.goto(`${AUTO}/board`);
  await shot(page, "board");
  await page.goto(`${AUTO}/dashboard`);
  await shot(page, "dashboard");
  await page.goto(`${AUTO}/applications/${made.nurse}`);
  await shot(page, "poor-fit");

  // ---- dark mode, once
  const dark = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1.5, reducedMotion: "reduce", colorScheme: "dark" });
  const darkPage = await dark.newPage();
  await darkPage.goto(`${AUTO}/board`);
  await shot(darkPage, "board-dark");
  await dark.close();

  // ---- paste mode
  await page.goto(`${PASTE}/onboarding`);
  await page.locator('input[name="resume"]').setInputFiles(fixture("resume.pdf"));
  await page.getByRole("button", { name: "Import and build my bank" }).click();
  await expect(page.getByRole("button", { name: "Copy prompt" })).toBeVisible();
  await page.getByLabel("Pasted reply").fill("```json\n" + fixtureText("bank.json") + "\n```");
  await page.getByRole("button", { name: "Build my bank" }).click();
  await page.waitForURL(/\/bank$/);
  await page.goto(`${PASTE}/generate`);
  await page.getByLabel("Posting text").fill(posting({ title: "Staff Backend Engineer", company: "Ledgerly", must: ["Postgres", "TypeScript", "Node", "Docker"], nice: ["Kubernetes", "AWS"] }));
  await page.getByRole("button", { name: "Tailor" }).click();
  await page.waitForURL(/\/applications\//);
  await page.getByLabel("Pasted reply").fill(fixtureText("selection-reply.txt"));
  await shot(page, "paste-mode");
  await page.getByRole("button", { name: "Submit reply" }).click();
  await expect(page.getByRole("heading", { name: /^Resume v\d+$/ })).toBeVisible({ timeout: 60_000 });
  await shot(page, "flags", { top: "text=What changed versus your base resume", offset: 110 });
  await context.close();

  // ---- the extension
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Staff Backend Engineer - Quillfeather</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Staff Backend Engineer","hiringOrganization":{"@type":"Organization","name":"Quillfeather"},"jobLocationType":"TELECOMMUTE","datePosted":"2026-11-10","description":"<p>Quillfeather is hiring a Staff Backend Engineer.</p>"}</script>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:36px auto;padding:0 24px;color:#1b1b1b;line-height:1.55}h1{margin:0}.co{color:#666;margin:4px 0 22px}form{border:1px solid #ddd;border-radius:12px;padding:20px;margin-top:26px}label{display:block;font-weight:600;margin:12px 0 6px}textarea{width:100%;box-sizing:border-box}button{margin-top:14px;padding:10px 18px;border:0;border-radius:8px;background:#1f4fd8;color:#fff;font-weight:600}</style></head>
<body><main><h1>Staff Backend Engineer</h1><p class="co">Quillfeather · Remote · quillfeather.example/careers</p>
<p>Role: Staff Backend Engineer<br>Company: Quillfeather<br>Location: Remote</p>
<p>Quillfeather is hiring a Staff Backend Engineer for its payments ledger. You will own the ledger service, design multi-currency accounting, and mentor engineers.</p>
<p>Must have: Postgres, TypeScript, Node, Docker.<br>Nice to have: Kubernetes, AWS.</p>
<form id="apply"><h2 style="margin:0">Apply for this job</h2><label for="resume">Resume</label><input type="file" name="resume" id="resume" accept=".pdf">
<label for="cover">Cover letter</label><textarea name="cover_letter" id="cover" rows="7"></textarea><button type="button">Submit application</button></form></main></body></html>`;
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const jobUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/careers/staff-backend-engineer`;
  const EXT = path.join(REPO, "apps", "extension", "dist");
  const ext = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 900, height: 760 },
    deviceScaleFactor: 1.5,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const worker = ext.serviceWorkers()[0] ?? (await ext.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;
  for (const p of ext.pages()) await p.close();
  const job = await ext.newPage();
  const panel = await ext.newPage();
  await panel.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "html{width:380px;min-height:100vh}*{animation:none!important;transition:none!important}";
      document.head.appendChild(style);
    });
  });
  await job.goto(jobUrl);
  await job.bringToFront();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.evaluate((apiBase) => chrome.storage.local.set({ apiBase }), AUTO);
  await job.bringToFront();
  await panel.reload();
  const press = (selector: string) => panel.locator(selector).dispatchEvent("click");
  await expect(panel.locator("#ready")).toBeVisible();
  await press("#capture");
  await expect(panel.locator("#attach")).toBeEnabled({ timeout: 60_000 });
  await press("#attach");
  await expect(panel.locator("#status")).toHaveText("Resume attached and cover letter filled.", { timeout: 30_000 });
  await panel.waitForTimeout(800);
  await panel.screenshot({ path: path.join(OUT, "extension-panel.png"), clip: { x: 0, y: 0, width: 380, height: 760 }, animations: "disabled" });
  await job.locator("#apply").scrollIntoViewIfNeeded();
  await job.screenshot({ path: path.join(OUT, "extension-attach.png"), animations: "disabled" });
  await ext.close();
  server.close();
});
