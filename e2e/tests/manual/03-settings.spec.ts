import { expect, test } from "@playwright/test";
import { sql } from "../../helpers.js";

test.describe("settings", () => {
  test("defaults assume Pakistan until saved", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByLabel(/Country you live in/)).toHaveValue("PK");
    await expect(page.getByLabel(/^Passport/)).toHaveValue("PK");
    expect(await sql("manual", `SELECT id FROM "Preferences" WHERE "savedAt" IS NOT NULL`)).toHaveLength(0);
  });

  test("saving from the checklist returns to it with the row ticked", async ({ page }) => {
    await page.goto("/setup");
    await page.getByRole("link", { name: "Choose settings" }).click();
    await page.getByRole("textbox", { name: /^Job titles/ }).fill("Backend Engineer\nPlatform Engineer");
    await page.getByLabel(/Applications per week/).fill("5");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page).toHaveURL(/\/setup/);
    await expect(page.getByText("3 of 4 done")).toBeVisible();
    const [prefs] = await sql<{ targetTitles: string[]; weeklyGoal: number; homeCountry: string }>("manual", `SELECT "targetTitles", "weeklyGoal", "homeCountry" FROM "Preferences"`);
    expect(prefs).toEqual({ targetTitles: ["Backend Engineer", "Platform Engineer"], weeklyGoal: 5, homeCountry: "PK" });
  });

  test("what was saved is shown again", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("textbox", { name: /^Job titles/ })).toHaveValue("Backend Engineer\nPlatform Engineer");
    await expect(page.getByLabel(/Applications per week/)).toHaveValue("5");
  });

  test("turning a pool off removes its tab", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("checkbox", { name: /^Gulf/ }).uncheck();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect.poll(async () => (await sql<{ pools: string[] }>("manual", `SELECT pools FROM "Preferences"`))[0]?.pools).toEqual(["remote", "relocate"]);
    await page.goto("/jobs");
    const pools = page.getByRole("navigation", { name: "Pools" });
    await expect(pools.getByRole("link", { name: "Remote" })).toBeVisible();
    await expect(pools.getByRole("link", { name: "Gulf" })).toHaveCount(0);

    await page.goto("/settings");
    await page.getByRole("checkbox", { name: /^Gulf/ }).check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect.poll(async () => (await sql<{ pools: string[] }>("manual", `SELECT pools FROM "Preferences"`))[0]?.pools).toHaveLength(3);
    await page.goto("/jobs");
    await expect(page.getByRole("navigation", { name: "Pools" }).getByRole("link", { name: "Gulf" })).toBeVisible();
  });

  test("appearance: dark mode and accent stay after a reload", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Appearance" }).click();
    await page.getByRole("button", { name: "Dark" }).click();
    await page.getByRole("button", { name: "Cobalt" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-accent", "cobalt");
  });

  test("the version and the data downloads are listed", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Version dev")).toBeVisible();
    await expect(page.getByRole("link", { name: "Everything as JSON" })).toHaveAttribute("href", "/api/export");
    await expect(page.getByRole("link", { name: /spreadsheet/ })).toHaveAttribute("href", "/api/export?format=csv");
  });
});
