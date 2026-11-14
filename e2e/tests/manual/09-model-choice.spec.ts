import { expect, test } from "@playwright/test";
import { idFromUrl, posting, sql, waitForDocuments } from "../../helpers.js";

/**
 * Choosing how the writing is done, and signing in, from inside the app.
 * This stack starts in paste mode with the stand-in tool signed out. The
 * last test puts it back, because the extension tests expect paste mode.
 */

const choice = (page: import("@playwright/test").Page, name: string) => page.getByRole("radio", { name: new RegExp(`^${name}`) });
const stored = async () => (await sql<{ provider: string | null }>("manual", `SELECT provider FROM "Preferences"`))[0]?.provider ?? null;

test.describe("choosing the model inside the app", () => {
  test("setup offers the three ways and no file to edit", async ({ page }) => {
    await page.goto("/setup");
    await expect(choice(page, "Copy and paste")).toHaveAttribute("aria-checked", "true");
    await expect(choice(page, "My Claude plan")).toBeVisible();
    await expect(choice(page, "My ChatGPT plan")).toBeVisible();
    // With no key in the environment the API option is not offered.
    await expect(choice(page, "Anthropic API key")).toHaveCount(0);
    await expect(page.getByRole("main")).not.toContainText(".env");
    await expect(page.getByRole("main")).not.toContainText("SHORTLISTED_PROVIDER");
  });

  test("choosing a Claude plan asks for a sign-in on the page", async ({ page }) => {
    await page.goto("/setup");
    await choice(page, "My Claude plan").click();
    await expect(choice(page, "My Claude plan")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Claude Code is not signed in yet.")).toBeVisible();
    expect(await stored()).toBe("claude-cli");
    // The checklist no longer counts the first row as done.
    await expect(page.getByRole("heading", { name: "A model to do the writing" }).locator("xpath=ancestor::li[1]").getByRole("img", { name: "Not done" })).toBeVisible();
  });

  test("a wrong code fails with the tool's own words and can be tried again", async ({ page }) => {
    await page.goto("/setup");
    await page.getByRole("button", { name: "Sign in" }).click();
    const link = page.getByRole("link", { name: "Open the sign-in page" });
    await expect(link).toHaveAttribute("href", /^https:\/\/claude\.example\/oauth\/authorize/);
    await expect(link).toHaveAttribute("target", "_blank");
    await page.getByLabel("Sign-in code").fill("wrong-code");
    await page.getByRole("button", { name: "Finish sign-in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Invalid code" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("the right code signs in, and the test call answers", async ({ page }) => {
    await page.goto("/setup");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByLabel("Sign-in code").fill("good-code");
    await page.getByRole("button", { name: "Finish sign-in" }).click();
    await expect(page.getByText("Claude Code is signed in. Captures run by themselves on your own subscription.")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Test it" }).click();
    await expect(page.getByRole("status").filter({ hasText: "It answered." })).toBeVisible({ timeout: 30_000 });
  });

  test("tailoring now runs by itself, with no restart", async ({ page }) => {
    await page.goto("/generate");
    await page.getByLabel("Posting text").fill(posting({ title: "Payments Engineer", company: "Copperleaf", must: ["Postgres", "TypeScript", "Node"] }));
    await page.getByRole("button", { name: "Tailor" }).click();
    await page.waitForURL(/\/applications\//);
    const id = idFromUrl(page);
    await expect(page.getByRole("heading", { name: "Your turn" })).toHaveCount(0);
    await waitForDocuments(page);
    const [app] = await sql<{ stage: string; generationStatus: string }>("manual", `SELECT stage, "generationStatus" FROM "Application" WHERE id = $1`, [id]);
    expect(app).toEqual({ stage: "GENERATED", generationStatus: "DONE" });
  });

  test("an application saved in paste mode can be started again without pasting", async ({ page }) => {
    const [waiting] = await sql<{ id: string }>("manual", `SELECT id FROM "Application" WHERE "generationStatus" = 'WAITING' ORDER BY "createdAt" LIMIT 1`);
    await page.goto(`/applications/${waiting!.id}`);
    await expect(page.getByRole("heading", { name: "Start again" })).toBeVisible();
    await page.getByRole("button", { name: "Regenerate" }).click();
    // It runs by itself now. This posting may be a poor fit, which is also an answer; what matters is that nothing waits for a paste.
    await expect.poll(async () => (await sql<{ generationStatus: string }>("manual", `SELECT "generationStatus" FROM "Application" WHERE id = $1`, [waiting!.id]))[0]?.generationStatus, { timeout: 45_000 }).toMatch(/^(DONE|SKIPPED)$/);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your turn" })).toHaveCount(0);
  });

  test("settings has the same choice, and sign out works", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "How the writing is done" })).toBeVisible();
    await expect(choice(page, "My Claude plan")).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByText("Claude Code is not signed in yet.")).toBeVisible({ timeout: 30_000 });
  });

  test("going back to copy and paste restores paste mode", async ({ page }) => {
    await page.goto("/settings");
    await choice(page, "Copy and paste").click();
    await expect(choice(page, "Copy and paste")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Paste mode. Each capture gives you a prompt")).toBeVisible();
    expect(await stored()).toBe("manual");

    await page.goto("/generate");
    await page.getByLabel("Posting text").fill(posting({ title: "Data Engineer", company: "Marrowfield", must: ["Postgres", "Python"] }));
    await page.getByRole("button", { name: "Tailor" }).click();
    await page.waitForURL(/\/applications\//);
    await expect(page.getByRole("heading", { name: "Your turn" })).toBeVisible();
  });
});
