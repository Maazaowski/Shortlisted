import { expect, test } from "@playwright/test";
import { fixture, sql } from "../../helpers.js";

const PAGES = ["/setup", "/onboarding", "/jobs", "/jobs?pool=relocate", "/jobs?pool=gulf", "/board", "/dashboard", "/bank", "/bank/check", "/generate", "/settings"];

async function detailPages(): Promise<string[]> {
  const [app] = await sql<{ id: string }>("manual", `SELECT a.id FROM "Application" a JOIN "Document" d ON d."applicationId" = a.id ORDER BY a."createdAt" LIMIT 1`);
  const [listing] = await sql<{ id: string }>("manual", `SELECT id FROM "Listing" ORDER BY "createdAt" LIMIT 1`);
  return [`/applications/${app!.id}`, `/jobs/${listing!.id}`];
}

test.describe("every page, once the install has data", () => {
  test("no page logs an error or asks for something that fails", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`${page.url()} console: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`${page.url()} error: ${e.message}`));
    page.on("response", (r) => {
      if (r.status() >= 400 && new URL(r.url()).host === new URL(page.url()).host) problems.push(`${page.url()} ${r.status()} ${r.url()}`);
    });
    for (const route of [...PAGES, ...(await detailPages())]) {
      await page.goto(route);
      await expect(page.getByRole("main")).toBeVisible();
      await page.waitForLoadState("networkidle");
    }
    expect(problems).toEqual([]);
  });

  test("every page has one main heading and a title", async ({ page }) => {
    for (const route of [...PAGES, ...(await detailPages())]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 }), route).toHaveCount(1);
      expect(await page.title(), route).not.toBe("");
    }
  });

  test("no page scrolls sideways on a phone", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    const wide: string[] = [];
    for (const route of [...PAGES, ...(await detailPages())]) {
      await page.goto(route);
      await expect(page.getByRole("main")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      // The board is a row of columns that scrolls inside its own box.
      if (overflow > 1) wide.push(`${route} is ${overflow}px too wide`);
    }
    await context.close();
    expect(wide).toEqual([]);
  });

  test("the nav marks the page you are on", async ({ page }) => {
    for (const [route, label] of [["/jobs", "Jobs"], ["/board", "Board"], ["/dashboard", "Dashboard"], ["/bank", "Bank"], ["/generate", "Paste"], ["/settings", "Settings"]] as const) {
      await page.goto(route);
      await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    }
  });
});

test.describe("other resume files", () => {
  test("a Word document is read", async ({ page }) => {
    await page.goto("/onboarding");
    await page.locator('input[name="resume"]').setInputFiles(fixture("resume.docx"));
    await page.getByRole("button", { name: "Import and build my bank" }).click();
    await expect(page.getByRole("button", { name: "Copy prompt" })).toBeVisible();
    await expect(page.getByText("resume.docx")).toBeVisible();
  });

  test("a PDF with almost no text is refused as a likely scan", async ({ page }) => {
    await page.goto("/onboarding");
    await page.locator('input[name="resume"]').setInputFiles(fixture("almost-empty.pdf"));
    await page.getByRole("button", { name: "Import and build my bank" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "That PDF has almost no text. Is it a scan?" })).toBeVisible();
  });

  test("a file that only claims to be a PDF is refused", async ({ page }) => {
    await page.goto("/onboarding");
    await page.locator('input[name="resume"]').setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("this is not a pdf") });
    await page.getByRole("button", { name: "Import and build my bank" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Could not read that PDF|almost no text/ })).toBeVisible();
  });

  test("the bank is untouched by the refused imports", async () => {
    expect(await sql("manual", `SELECT id FROM "BankBullet"`)).toHaveLength(7);
  });
});
