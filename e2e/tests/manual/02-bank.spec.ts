import { expect, test, type Page } from "@playwright/test";
import { sql } from "../../helpers.js";

/** The saved bullets on the bank page, in order. The "new bullet" rows have a different label. */
const addForm = (page: Page) => page.locator("details", { hasText: "Add a role or project" });
const bulletRows = (page: Page) => page.locator("li", { has: page.locator('[aria-label="Bullet text"]') });

test.describe("the experience bank and the CV check", () => {
  test("the check scores the imported bank and lists what to fix", async ({ page }) => {
    await page.goto("/bank");
    await page.getByRole("link", { name: "Check my CV" }).click();
    await expect(page.getByRole("heading", { name: "CV check" })).toBeVisible();
    await expect(page.getByText("90 / 100")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Give your city and country" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add your LinkedIn profile" })).toBeVisible();
  });

  test("fixing the profile raises the score", async ({ page }) => {
    await page.goto("/bank");
    await page.getByLabel("Location", { exact: true }).first().fill("Lahore, Pakistan");
    await page.getByRole("textbox", { name: /^Links/ }).fill("https://github.com/example\nhttps://www.linkedin.com/in/sample-person");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect.poll(async () => (await sql<{ location: string }>("manual", `SELECT location FROM "Profile"`))[0]?.location).toBe("Lahore, Pakistan");
    await page.goto("/bank/check");
    await expect(page.getByText("100 / 100")).toBeVisible();
  });

  test("a bullet can be added, edited and deleted", async ({ page }) => {
    await page.goto("/bank");
    await expect(page.getByRole("complementary")).toContainText(/7\s*bullets/);

    await page.getByLabel("New bullet text").first().fill("I was responsible for the on-call rota of a team of people");
    await page.getByRole("button", { name: "Add bullet" }).first().click();
    await expect(page.getByRole("complementary")).toContainText(/8\s*bullets/);

    // The check notices the weak new bullet.
    await page.goto("/bank/check");
    await expect(page.getByText("100 / 100")).toHaveCount(0);
    await expect(page.getByText("I was responsible for the on-call rota").first()).toBeVisible();

    await page.goto("/bank");
    const added = bulletRows(page).nth(4);
    await expect(added.getByLabel("Bullet text")).toHaveValue(/on-call rota/);
    await added.getByLabel("Bullet text").fill("Ran the on-call rota for 6 engineers and cut pages by 30%");
    await added.getByLabel("Skills").fill("Incident Response, On Call");
    await added.getByLabel("Metric").fill("30%");
    await added.getByRole("button", { name: "Save" }).click();
    await expect
      .poll(async () => (await sql<{ skills: string[] }>("manual", `SELECT skills FROM "BankBullet" WHERE text LIKE 'Ran the on-call%'`))[0]?.skills)
      .toEqual(["incident response", "on call"]);

    await page.reload();
    await bulletRows(page).nth(4).getByRole("button", { name: "Delete bullet" }).click();
    await expect(page.getByRole("complementary")).toContainText(/7\s*bullets/);
  });

  test("a role can be added and deleted", async ({ page }) => {
    await page.goto("/bank");
    await page.getByText("Add a role or project").click();
    await addForm(page).getByLabel("Company or project name").fill("Temp Corp");
    await addForm(page).getByLabel("Title", { exact: true }).fill("Contract Engineer");
    await addForm(page).getByLabel("Start", { exact: true }).fill("2017-01");
    await addForm(page).getByLabel("End", { exact: true }).fill("2017-12");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Contract Engineer at Temp Corp" })).toBeVisible();

    // The role itself can be corrected without deleting it.
    const role = page.locator("section", { has: page.getByRole("heading", { name: "Contract Engineer at Temp Corp" }) });
    await role.getByText("Edit details").click();
    await role.getByLabel("Title", { exact: true }).fill("Contract Developer");
    await role.getByLabel("End", { exact: true }).fill("2018-06");
    await role.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByRole("heading", { name: "Contract Developer at Temp Corp" })).toBeVisible();
    expect(await sql("manual", `SELECT title, "endDate" FROM "BankEntry" WHERE organization = 'Temp Corp'`)).toEqual([{ title: "Contract Developer", endDate: "2018-06" }]);

    await page.getByRole("button", { name: "Delete Contract Developer" }).click();
    await expect(page.getByRole("heading", { name: "Contract Developer at Temp Corp" })).toHaveCount(0);
    expect(await sql("manual", `SELECT id FROM "BankEntry"`)).toHaveLength(3);
  });

  test("a role date typed in words is stopped by the form", async ({ page }) => {
    await page.goto("/bank");
    await page.getByText("Add a role or project").click();
    await addForm(page).getByLabel("Company or project name").fill("Bad Dates Ltd");
    await addForm(page).getByLabel("Title", { exact: true }).fill("Engineer");
    await addForm(page).getByLabel("Start", { exact: true }).fill("January 2017");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.waitForTimeout(800);
    expect(await sql("manual", `SELECT id FROM "BankEntry" WHERE organization = 'Bad Dates Ltd'`)).toHaveLength(0);

    // A date in another common form is stored the standard way.
    await addForm(page).getByLabel("Start", { exact: true }).fill("2017-3");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Engineer at Bad Dates Ltd" })).toBeVisible();
    const rows = await sql<{ startDate: string | null }>("manual", `SELECT "startDate" FROM "BankEntry" WHERE organization = 'Bad Dates Ltd'`);
    expect(rows).toEqual([{ startDate: "2017-03" }]);
    await page.getByRole("button", { name: "Delete Engineer" }).click();
    await expect(page.getByRole("heading", { name: "Engineer at Bad Dates Ltd" })).toHaveCount(0);
  });
});
