import { expect, test } from "@playwright/test";
import { fixture, fixtureText, sql } from "../../helpers.js";

test.describe("a new install with nothing in it", () => {
  test("the home address leads to the setup checklist", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByRole("heading", { name: "Finish setting up" })).toBeVisible();
    await expect(page.getByText("1 of 4 done")).toBeVisible();
    await expect(page.getByText("Paste mode.")).toBeVisible();
  });

  test("the bank and the CV check say there is nothing yet", async ({ page }) => {
    await page.goto("/bank");
    await expect(page.getByRole("heading", { name: "No bank yet" })).toBeVisible();
    await page.goto("/bank/check");
    await expect(page.getByRole("heading", { name: "Nothing to check yet" })).toBeVisible();
  });

  test("an unknown address shows the not found page", async ({ page }) => {
    const res = await page.goto("/no-such-page");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("link").first()).toBeVisible();
  });

  test("an unknown application shows the not found page", async ({ page }) => {
    const res = await page.goto("/applications/nope");
    expect(res?.status()).toBe(404);
  });

  test("tailoring with no bank is refused with a sentence", async ({ page }) => {
    await page.goto("/generate");
    await page.getByLabel("Posting text").fill("Title: Backend Engineer\nCompany: Nobank Ltd\nMust have: Postgres. ".repeat(3));
    await page.getByRole("button", { name: "Tailor" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Your experience bank is empty. Import your resume first" })).toBeVisible();
    expect(await sql("manual", `SELECT id FROM "Application"`)).toHaveLength(0);
  });
});

test.describe("importing a resume in paste mode", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("a file that is not a resume is refused", async ({ page }) => {
    await page.goto("/onboarding");
    await page.locator('input[name="resume"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await page.getByRole("button", { name: "Import and build my bank" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Choose a PDF or a Word document" })).toBeVisible();
  });

  test("an old .doc file is refused with advice", async ({ page }) => {
    await page.goto("/onboarding");
    await page.locator('input[name="resume"]').setInputFiles({ name: "cv.doc", mimeType: "application/msword", buffer: Buffer.from("x".repeat(500)) });
    await page.getByRole("button", { name: "Import and build my bank" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Old .doc files are not supported" })).toBeVisible();
  });

  test("a PDF becomes a prompt, and the pasted reply becomes the bank", async ({ page }) => {
    await page.goto("/onboarding");
    await page.locator('input[name="resume"]').setInputFiles(fixture("resume.pdf"));
    await expect(page.getByText("resume.pdf")).toBeVisible();
    await page.getByRole("button", { name: "Import and build my bank" }).click();

    await page.getByRole("button", { name: "Copy prompt" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    expect(prompt).toContain("Acme Payments");
    expect(prompt).toContain("## Resume");

    // A reply that is not JSON is refused and the form stays.
    await page.getByLabel("Pasted reply").fill("Sorry, I cannot do that.");
    await page.getByRole("button", { name: "Build my bank" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "No JSON object found" })).toBeVisible();

    // JSON of the wrong shape names the field.
    await page.getByLabel("Pasted reply").fill('{"fullName": 4}');
    await page.getByRole("button", { name: "Build my bank" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "does not match the expected shape" })).toBeVisible();

    await page.getByLabel("Pasted reply").fill("Here you go:\n```json\n" + fixtureText("bank.json") + "\n```");
    await page.getByRole("button", { name: "Build my bank" }).click();
    await expect(page).toHaveURL(/\/bank$/);
    await expect(page.getByRole("heading", { name: "Senior Software Engineer at Acme Payments" })).toBeVisible();

    const [counts] = await sql<{ entries: number; bullets: number }>("manual", `SELECT (SELECT count(*)::int FROM "BankEntry") AS entries, (SELECT count(*)::int FROM "BankBullet") AS bullets`);
    expect(counts).toEqual({ entries: 3, bullets: 7 });
  });

  test("the checklist now counts the resume", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.getByText("2 of 4 done")).toBeVisible();
    await expect(page.getByText("Imported, 7 bullets in your bank.")).toBeVisible();
    await page.goto("/board");
    await expect(page.getByRole("heading", { name: "Board" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nothing captured yet" })).toBeVisible();
  });
});
