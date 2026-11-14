import { expect, test } from "@playwright/test";
import { fixture, idFromUrl, posting, sql, waitForDocuments } from "../../helpers.js";

/**
 * The automatic path: SHORTLISTED_PROVIDER=claude-cli with a stand-in for
 * Claude Code (e2e/fake-cli). Nothing is pasted anywhere in these tests.
 */

const appRow = async (id: string) => (await sql<{ stage: string; generationStatus: string; generationError: string | null; fitVerdict: string | null }>("cli", `SELECT stage, "generationStatus", "generationError", "fitVerdict" FROM "Application" WHERE id = $1`, [id]))[0];

async function paste(page: import("@playwright/test").Page, text: string): Promise<string> {
  await page.goto("/generate");
  await page.getByLabel("Posting text").fill(text);
  await page.getByRole("button", { name: "Tailor" }).click();
  await page.waitForURL(/\/applications\//);
  return idFromUrl(page);
}

test.describe("setup with a signed-in command line tool", () => {
  test("the checklist sees the tool and the test button reaches it", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.getByRole("heading", { name: "Finish setting up" })).toBeVisible();
    await expect(page.getByText("1 of 4 done")).toBeVisible();
    await expect(page.getByRole("main")).toContainText("Claude Code");
    await expect(page.getByText("Claude Code is signed in. Captures run by themselves on your own subscription.")).toBeVisible();
    await page.getByRole("button", { name: "Test it" }).click();
    await expect(page.getByRole("status").filter({ hasText: "It answered." })).toBeVisible({ timeout: 30_000 });
  });

  test("a resume is imported in one step", async ({ page }) => {
    await page.goto("/onboarding");
    await page.locator('input[name="resume"]').setInputFiles(fixture("resume.pdf"));
    await page.getByRole("button", { name: "Import and build my bank" }).click();
    await expect(page).toHaveURL(/\/bank$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Senior Software Engineer at Acme Payments" })).toBeVisible();
    expect(await sql("cli", `SELECT id FROM "BankBullet"`)).toHaveLength(7);
  });
});

test.describe("tailoring without pasting", () => {
  let goodId = "";

  test("a pasted posting becomes two documents with no further step", async ({ page, request }) => {
    goodId = await paste(page, posting({ title: "Staff Backend Engineer", company: "Ledgerly", must: ["Postgres", "TypeScript", "Node", "Docker"], nice: ["Kubernetes", "AWS"] }));
    await expect(page.getByRole("heading", { name: "Your turn" })).toHaveCount(0);
    await waitForDocuments(page);
    await expect(page.getByRole("heading", { name: "Staff Backend Engineer", level: 1 })).toBeVisible();
    await expect(page.getByRole("main")).toContainText("Strong fit");
    await expect(page.getByRole("main")).toContainText("would like to do that at Ledgerly");
    const row = await appRow(goodId);
    expect(row).toMatchObject({ stage: "GENERATED", generationStatus: "DONE" });

    const href = await page.getByRole("link", { name: /Sample Person - Staff Backend Engineer - Ledgerly\.pdf/ }).getAttribute("href");
    const pdf = await request.get(href!);
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  });

  test("regenerate makes version two by itself", async ({ page }) => {
    await page.goto(`/applications/${goodId}`);
    await page.getByLabel("Regenerate instruction").fill("Shorter summary");
    await page.getByRole("button", { name: "Regenerate" }).click();
    await expect(page.getByRole("heading", { name: "Resume v2" })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("heading", { name: "Your turn" })).toHaveCount(0);
  });

  test("a rewording that invents a number and a tool is flagged", async ({ page }) => {
    const id = await paste(page, posting({ title: "Ledger Engineer", company: "Fennel Finance", must: ["Postgres", "TypeScript"], extra: "FAKE_INVENT" }));
    await waitForDocuments(page);
    await expect(page.getByText("Flagged by validation")).toBeVisible();
    const flags = (await sql<{ flags: { kind: string; detail: string }[] }>("cli", `SELECT flags FROM "Document" WHERE "applicationId" = $1 AND type = 'RESUME'`, [id]))[0]!.flags;
    expect(flags.map((f) => f.kind)).toEqual(expect.arrayContaining(["added_number", "new_term"]));
    expect(JSON.stringify(flags)).toContain("97%");
  });

  test("a poor fit stops before anything is written", async ({ page }) => {
    const id = await paste(page, posting({ title: "Registered Nurse", company: "Northwind Hospital", location: "Leeds", must: ["Nursing", "Phlebotomy", "Triage", "Patient care"] }));
    await expect(page.getByText("Poor fit. Nothing generated.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Must-haves it does not cover")).toBeVisible();
    // The page says to add the skill and try again, so the button has to be there.
    await expect(page.getByRole("button", { name: "Regenerate" })).toBeVisible();
    expect(await appRow(id)).toMatchObject({ stage: "SAVED", generationStatus: "SKIPPED", fitVerdict: "POOR" });
    expect(await sql("cli", `SELECT id FROM "Document" WHERE "applicationId" = $1`, [id])).toHaveLength(0);
  });

  test("after the missing skill is added to the bank, trying again tailors it", async ({ page }) => {
    const [app] = await sql<{ id: string }>("cli", `SELECT a.id FROM "Application" a JOIN "Job" j ON j.id = a."jobId" WHERE j.company = 'Northwind Hospital'`);
    await page.goto("/bank");
    await page.getByLabel("New bullet text").first().fill("Ran triage for a 20 bed ward as a volunteer nurse");
    await page.getByLabel("Skills").nth(4).fill("nursing, triage, phlebotomy, patient care");
    await page.getByRole("button", { name: "Add bullet" }).first().click();
    await expect.poll(async () => (await sql("cli", `SELECT id FROM "BankBullet"`)).length).toBe(8);

    await page.goto(`/applications/${app!.id}`);
    await page.getByRole("button", { name: "Regenerate" }).click();
    await waitForDocuments(page);
    expect((await appRow(app!.id))?.fitVerdict).not.toBe("POOR");
    await sql("cli", `DELETE FROM "BankBullet" WHERE text LIKE 'Ran triage%'`);
  });

  test("a page that is not a job posting ends with a sentence", async ({ page }) => {
    const id = await paste(page, "FAKE_NOTJOB. This is a long article about growing tomatoes at home in pots. ".repeat(4) + Math.random());
    await expect(page.getByText("This page does not look like a single job posting.")).toBeVisible({ timeout: 60_000 });
    expect(await appRow(id)).toMatchObject({ stage: "SAVED", generationStatus: "FAILED" });
  });

  test("a tool that is signed out fails with the way to fix it", async ({ page }) => {
    test.setTimeout(120_000);
    const id = await paste(page, posting({ title: "Backend Engineer", company: "Signedout Ltd", must: ["Postgres"], extra: "FAKE_FAIL" }));
    await expect(page.getByText(/Claude Code exited with code 1/)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("main")).toContainText("claude auth login");
    await expect(page.getByRole("heading", { name: "Untitled posting", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Regenerate" })).toBeVisible();
    expect(await appRow(id)).toMatchObject({ stage: "SAVED", generationStatus: "FAILED" });
  });

  test("a reply that is not usable fails after one more try", async ({ page }) => {
    test.setTimeout(120_000);
    await paste(page, posting({ title: "Backend Engineer", company: "Chatty Ltd", must: ["Postgres"], extra: "FAKE_BADJSON" }));
    await expect(page.getByText(/Claude Code gave a parse reply that could not be used/)).toBeVisible({ timeout: 90_000 });
  });

  test("the board shows the failed and skipped cards for what they are", async ({ page }) => {
    await page.goto("/board");
    const saved = page.getByRole("region", { name: "Saved" });
    await expect(saved).toContainText("Generation failed");
    await expect(page.getByRole("region", { name: "Generated" })).toContainText("Ledgerly");
  });
});

test.describe("key requirements on a role from the job list", () => {
  test("the requirements are read once, shown against the bank, and reused when tailoring", async ({ page }) => {
    await page.goto("/jobs");
    await page.getByRole("link", { name: /Senior Backend Engineer/ }).click();
    await page.waitForURL(/\/jobs\/c/);
    const listingId = idFromUrl(page);
    await page.getByRole("button", { name: "Read the key requirements" }).click();
    await expect(page.getByRole("button", { name: "Read the key requirements" })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Reading the posting" })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText("Must have, 4 of 4 in your bank")).toBeVisible();
    await expect(page.getByText("Nice to have, 1 of 2 in your bank")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "kubernetes" })).toContainText("not in your bank");
    const [listing] = await sql<{ parsed: { mustHaveSkills: string[]; niceToHaveSkills: string[] } | null }>("cli", `SELECT parsed FROM "Listing" WHERE id = $1`, [listingId]);
    expect(listing?.parsed?.mustHaveSkills).toEqual(["postgres", "typescript", "node", "docker"]);
    expect(listing?.parsed?.niceToHaveSkills).toEqual(["kubernetes", "aws"]);

    await page.getByRole("button", { name: "Tailor my resume" }).click();
    await page.waitForURL(/\/applications\//);
    const applicationId = idFromUrl(page);
    await waitForDocuments(page);
    const [job] = await sql<{ parsed: { mustHaveSkills: string[] } | null }>("cli", `SELECT j.parsed FROM "Job" j JOIN "Application" a ON a."jobId" = j.id WHERE a.id = $1`, [applicationId]);
    expect(job?.parsed?.mustHaveSkills).toEqual(["postgres", "typescript", "node", "docker"]);
    const [linked] = await sql<{ applicationId: string | null }>("cli", `SELECT "applicationId" FROM "Listing" WHERE id = $1`, [listingId]);
    expect(linked?.applicationId).toBe(applicationId);
  });
});
