import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { fixtureText, sql } from "../../helpers.js";
import { REPO, STACKS } from "../../stack.js";

/**
 * The Chrome extension, loaded unpacked into Playwright's own Chromium and
 * pointed at the paste-mode stack. The panel page runs as a background tab
 * beside the job page, so "the active tab" is the job page, exactly as it is
 * inside the real side panel.
 */

const EXTENSION = path.join(REPO, "apps", "extension", "dist");
const API = STACKS.manual.url;

let server: Server;
let context: BrowserContext;
let job: Page;
let panel: Page;
let jobUrl = "";

/** A click sent from inside the page. Mouse clicks do not reach a background tab reliably. */
const press = (selector: string) => panel.locator(selector).dispatchEvent("click");

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const run = Date.now().toString(36);
  const html = fixtureText("ledgerly.html").replaceAll("RUN_TOKEN", run).replaceAll("Ledgerly", "Quillfeather");
  server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  jobUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jobs/quillfeather-${run}`;

  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: { width: 1200, height: 900 },
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;

  job = context.pages()[0] ?? (await context.newPage());
  await job.goto(jobUrl);
  panel = await context.newPage();
  await job.bringToFront();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.evaluate((apiBase) => chrome.storage.local.set({ apiBase }), API);
  await job.bringToFront();
  await panel.reload();
});

test.afterAll(async () => {
  await context?.close();
  server?.close();
});

test("the panel connects to the web app and sees the job page", async () => {
  await expect(panel.locator("#ready")).toBeVisible();
  await expect(panel.locator("#not-connected")).toBeHidden();
  await expect(panel.locator("#tab-title")).toHaveText("Staff Backend Engineer - Quillfeather");
});

test("one click captures the posting and waits for the reply", async () => {
  await press("#capture");
  await expect(panel.locator("#result")).toContainText("Your turn", { timeout: 20_000 });
  const [row] = await sql<{ url: string; company: string | null; generationStatus: string }>(
    "manual",
    `SELECT j.url, j.company, a."generationStatus" FROM "Application" a JOIN "Job" j ON j.id = a."jobId" WHERE j.url = $1`,
    [jobUrl],
  );
  // The title and company come from the page's own structured data, before any model reads it.
  expect(row).toEqual({ url: jobUrl, company: "Quillfeather", generationStatus: "WAITING" });
});

test("a bad reply is refused inside the panel", async () => {
  await panel.locator("#reply-text").fill("not json at all");
  await press("#submit-reply");
  await expect(panel.locator("#reply-status")).toContainText("No JSON object found");
});

test("the pasted reply produces the documents", async () => {
  await panel.locator("#reply-text").fill(fixtureText("selection-reply.txt").replaceAll("Ledgerly", "Quillfeather"));
  await press("#submit-reply");
  await expect(panel.locator("#attach")).toBeEnabled({ timeout: 45_000 });
  await expect(panel.locator("#result")).toContainText("Strong fit");
  await expect(panel.locator("#result")).toContainText("In your bank");
});

test("attach puts the resume and the cover letter into the form on the job page", async () => {
  await press("#attach");
  await expect(panel.locator("#status")).toHaveText("Resume attached and cover letter filled.", { timeout: 20_000 });
  const form = await job.evaluate(() => {
    const file = (document.getElementById("resume") as HTMLInputElement).files?.[0];
    return { name: file?.name ?? null, size: file?.size ?? 0, cover: (document.getElementById("cover") as HTMLTextAreaElement).value };
  });
  expect(form.name).toBe("Sample Person - Staff Backend Engineer - Quillfeather.pdf");
  expect(form.size).toBeGreaterThan(5000);
  expect(form.cover).toContain("Dear hiring team");
});

test("marking applied from the panel changes the stage in the app", async () => {
  await press('[data-stage="APPLIED"]');
  await expect.poll(async () => (await sql<{ stage: string }>("manual", `SELECT a.stage FROM "Application" a JOIN "Job" j ON j.id = a."jobId" WHERE j.url = $1`, [jobUrl]))[0]?.stage).toBe("APPLIED");
  await expect(panel.locator(".pill.accent")).toHaveText(/Applied/);
});

test("opening the panel on the same page again shows the existing result", async () => {
  await job.bringToFront();
  await panel.reload();
  await expect(panel.locator("#result")).toContainText("Strong fit", { timeout: 20_000 });
  expect(await sql("manual", `SELECT a.id FROM "Application" a JOIN "Job" j ON j.id = a."jobId" WHERE j.url = $1`, [jobUrl])).toHaveLength(1);
});

test("a wrong address shows how to fix it, and the right one reconnects", async () => {
  await panel.evaluate(() => chrome.storage.local.set({ apiBase: "http://localhost:59999" }));
  await panel.reload();
  await expect(panel.locator("#not-connected")).toBeVisible({ timeout: 20_000 });
  await expect(panel.locator("#not-connected-message")).not.toHaveText("Checking the web app.");

  await press("#settings-toggle");
  await panel.locator("#api-base").fill(API);
  await press("#save-settings");
  await expect(panel.locator("#ready")).toBeVisible({ timeout: 20_000 });
});

test("a page with too little text is refused with a sentence", async () => {
  const blank = await context.newPage();
  await blank.setContent("<title>Nothing here</title><p>Short page.</p>");
  await blank.bringToFront();
  await panel.reload();
  await expect(panel.locator("#ready")).toBeVisible();
  await press("#capture");
  await expect(panel.locator("#status")).toHaveText(/./, { timeout: 15_000 });
  const message = await panel.locator("#status").textContent();
  expect(message).not.toBe("Reading this page");
  expect(message).not.toBe("Saved.");
  await blank.close();
});
