import { expect, test, type Page } from "@playwright/test";
import { buildFeedListings, writeFeed } from "../../feed-fixture.js";
import { idFromUrl, runFeedSync, sql } from "../../helpers.js";
import { FEED_DIR } from "../../stack.js";

const rows = (page: Page) => page.getByRole("main").getByRole("list").first().getByRole("listitem");
const row = (page: Page, title: string) => rows(page).filter({ has: page.getByRole("link", { name: new RegExp(title) }) });

async function setCountry(page: Page, home: string, passport: string) {
  await page.goto("/settings");
  await page.getByLabel(/Country you live in/).selectOption(home);
  await page.getByLabel(/^Passport/).selectOption(passport);
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect.poll(async () => (await sql<{ homeCountry: string }>("manual", `SELECT "homeCountry" FROM "Preferences"`))[0]?.homeCountry).toBe(home);
}

test.describe("finding jobs", () => {
  test("the remote pool shows only roles that admit the home country", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page.getByText("Remote roles whose posting admits someone living in Pakistan. 2 roles match.")).toBeVisible();
    await expect(row(page, "Customer Support Specialist")).toContainText("Remote, admits Pakistan");
    await expect(row(page, "Senior Backend Engineer")).toContainText("Remote, probably anywhere");
    // US only and EMEA only roles are not offered to someone in Pakistan.
    await expect(row(page, "Frontend Engineer")).toHaveCount(0);
    await expect(row(page, "Data Analyst")).toHaveCount(0);
  });

  test("each row says how much of it the bank covers", async ({ page }) => {
    await page.goto("/jobs");
    await expect(row(page, "Senior Backend Engineer")).toContainText(/\d of \d skills in your bank/);
  });

  test("include unclear adds remote roles that do not say where", async ({ page }) => {
    await page.goto("/jobs");
    await page.getByLabel("Include unclear").check();
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/unclear=1/);
    await expect(rows(page)).toHaveCount(4);
    await expect(row(page, "Product Designer")).toBeVisible();
    // A posting over 45 days old is marked.
    await expect(row(page, "Backend Engineer Oldfield")).toContainText("may be stale");
  });

  test("last 30 days drops the old posting", async ({ page }) => {
    await page.goto("/jobs?pool=remote&unclear=1");
    await page.getByLabel("Last 30 days").check();
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(rows(page)).toHaveCount(3);
    await expect(row(page, "Backend Engineer Oldfield")).toHaveCount(0);
  });

  test("tech only and the career field narrow the list", async ({ page }) => {
    await page.goto("/jobs");
    await page.getByLabel("Tech only").check();
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, "Senior Backend Engineer")).toBeVisible();

    await page.goto("/jobs");
    await page.getByLabel("Career field").selectOption({ label: "Customer Support" });
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, "Customer Support Specialist")).toBeVisible();
  });

  test("search finds a word in the title, the company or the posting", async ({ page }) => {
    await page.goto("/jobs");
    await page.getByLabel("Search").fill("ledgerly");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, "Senior Backend Engineer")).toBeVisible();

    await page.getByLabel("Search").fill("tickets");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(row(page, "Customer Support Specialist")).toBeVisible();

    await page.getByLabel("Search").fill("zzzznothing");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByRole("heading", { name: "Nothing matches" })).toBeVisible();
  });

  test("best match first puts the role closest to the bank on top", async ({ page }) => {
    await page.goto("/jobs?pool=remote&unclear=1");
    await page.getByLabel("Order").selectOption("match");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/sort=match/);
    await expect(rows(page).first()).toContainText("Senior Backend Engineer");
  });

  test("relocate shows roles that state sponsorship, with the posting's own sentence", async ({ page }) => {
    await page.goto("/jobs");
    await page.getByRole("navigation", { name: "Pools" }).getByRole("link", { name: "Relocate" }).click();
    await expect(rows(page)).toHaveCount(2);
    // The offer names a country, so the tag says which one.
    await expect(row(page, "Platform Engineer")).toContainText("Visa sponsorship stated, for Germany only");
    await expect(row(page, "Software Engineer Najd")).toContainText("Visa sponsorship stated");
    await expect(row(page, "Software Engineer Najd")).not.toContainText("only");
    await expect(row(page, "Platform Engineer")).toContainText("Relocation support stated");
    await expect(row(page, "Software Engineer Najd")).toContainText("Office in Saudi Arabia");
    // The London role that refuses sponsorship never reaches the list.
    expect(await sql("manual", `SELECT id FROM "Listing" WHERE company = 'Harbour Bank'`)).toHaveLength(0);
  });

  test("gulf shows office roles in the Gulf, with the fee warning", async ({ page }) => {
    await page.goto("/jobs?pool=gulf");
    await expect(rows(page)).toHaveCount(2);
    await expect(row(page, "Finance Manager")).toContainText("Office in United Arab Emirates");
    await expect(page.getByRole("main")).toContainText(/fee/i);
  });

  test("the role page shows the evidence, the skills and a link to the employer", async ({ page }) => {
    await page.goto("/jobs?pool=relocate");
    await page.getByRole("link", { name: /Platform Engineer/ }).click();
    await expect(page.getByRole("heading", { name: "Platform Engineer", level: 1 })).toBeVisible();
    await expect(page.getByRole("blockquote")).toContainText("We offer visa sponsorship and a relocation package");
    await expect(page.getByText("Nobody has checked this role by hand.")).toBeVisible();
    await expect(page.getByText("In your bank, 1 of 3")).toBeVisible();
    const apply = page.getByRole("link", { name: "Apply on the company's page" });
    await expect(apply).toHaveAttribute("href", "https://jobs.example.com/kranz-mobility/1005");
    await expect(apply).toHaveAttribute("target", "_blank");
    // Paste mode has no button to read the requirements ahead of tailoring.
    await expect(page.getByRole("button", { name: /key requirements/i })).toHaveCount(0);
  });

  test("a role can be saved, found under saved only, and removed again", async ({ page }) => {
    await page.goto("/jobs");
    await page.getByRole("button", { name: "Save Senior Backend Engineer for later" }).click();
    await expect(page.getByRole("button", { name: "Remove Senior Backend Engineer from saved" })).toBeVisible();
    await page.getByRole("link", { name: "Saved only" }).click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Remove Senior Backend Engineer from saved" }).click();
    await expect(page.getByRole("heading", { name: "Nothing matches" })).toBeVisible();
  });

  test("a hidden role leaves the list and can be brought back from its page", async ({ page }) => {
    await page.goto("/jobs");
    await page.getByRole("link", { name: /Customer Support Specialist/ }).click();
    await page.waitForURL(/\/jobs\/c/);
    const address = page.url();
    await page.goto("/jobs");
    await page.getByRole("button", { name: "Hide Customer Support Specialist" }).click();
    await expect(row(page, "Customer Support Specialist")).toHaveCount(0);
    await expect(page.getByText("1 role matches", { exact: false })).toBeVisible();

    await page.goto(address);
    await expect(page.getByText("You hid this role. It does not appear in the lists.")).toBeVisible();
    await page.getByRole("button", { name: "Show again" }).click();
    await expect(page.getByText("You hid this role.")).toHaveCount(0);
    await page.goto("/jobs");
    await expect(row(page, "Customer Support Specialist")).toBeVisible();
  });

  test("changing the home country changes who a remote role admits", async ({ page }) => {
    await setCountry(page, "US", "US");
    await page.goto("/jobs");
    await expect(page.getByText("someone living in United States")).toBeVisible();
    await expect(row(page, "Frontend Engineer")).toContainText("Remote, admits United States");
    await expect(row(page, "Customer Support Specialist")).toHaveCount(0);

    // Germany is in EMEA, and a German passport needs no sponsor in Germany.
    await setCountry(page, "DE", "DE");
    await page.goto("/jobs");
    await expect(row(page, "Data Analyst")).toBeVisible();
    await page.goto("/jobs?pool=relocate");
    await expect(row(page, "Platform Engineer")).toHaveCount(0);
    await expect(row(page, "Software Engineer Najd")).toBeVisible();

    await setCountry(page, "PK", "PK");
  });

  test("a role the feed drops is closed, not deleted, and returns when the feed has it again", async ({ page }) => {
    const all = buildFeedListings();
    writeFeed(FEED_DIR, all.filter((l) => l.company !== "Meridian Health"));
    await runFeedSync("manual");
    await expect.poll(async () => (await sql<{ closedAt: Date | null }>("manual", `SELECT "closedAt" FROM "Listing" WHERE company = 'Meridian Health'`))[0]?.closedAt, { timeout: 30_000 }).not.toBeNull();

    const [closed] = await sql<{ id: string }>("manual", `SELECT id FROM "Listing" WHERE company = 'Meridian Health'`);
    await page.goto(`/jobs/${closed!.id}`);
    await expect(page.getByRole("main")).toContainText(/no longer|closed/i);

    writeFeed(FEED_DIR, all);
    await runFeedSync("manual");
    await expect.poll(async () => (await sql<{ closedAt: Date | null }>("manual", `SELECT "closedAt" FROM "Listing" WHERE company = 'Meridian Health'`))[0]?.closedAt, { timeout: 30_000 }).toBeNull();
  });

  test("a broken feed keeps the old listings and says why", async ({ page }) => {
    writeFeed(FEED_DIR, []);
    await runFeedSync("manual");
    await expect.poll(async () => (await sql<{ lastError: string | null }>("manual", `SELECT "lastError" FROM "FeedSync"`))[0]?.lastError, { timeout: 30_000 }).toContain("empty");
    await page.goto("/jobs");
    await expect(page.getByText("The job feed is empty. Keeping the listings already here.")).toBeVisible();
    await expect(page.getByText("The listings below are from the last successful check.")).toBeVisible();
    await expect(rows(page)).toHaveCount(2);

    writeFeed(FEED_DIR, buildFeedListings());
    await runFeedSync("manual");
    await expect.poll(async () => (await sql<{ lastError: string | null }>("manual", `SELECT "lastError" FROM "FeedSync"`))[0]?.lastError, { timeout: 30_000 }).toBeNull();
  });

  test("tailor my resume turns a role into an application linked to it", async ({ page }) => {
    await page.goto("/jobs?pool=relocate");
    await page.getByRole("link", { name: /Platform Engineer/ }).click();
    await page.waitForURL(/\/jobs\/c/);
    const listingId = idFromUrl(page);
    await page.getByRole("button", { name: "Tailor my resume" }).click();
    await page.waitForURL(/\/applications\//);
    const applicationId = idFromUrl(page);
    await expect(page.getByRole("heading", { name: "Your turn" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Platform Engineer", level: 1 })).toBeVisible();

    const [listing] = await sql<{ applicationId: string | null }>("manual", `SELECT "applicationId" FROM "Listing" WHERE id = $1`, [listingId]);
    expect(listing?.applicationId).toBe(applicationId);

    // The role page now leads to the application instead of making a second one.
    await page.goto(`/jobs/${listingId}`);
    await page.getByRole("link", { name: /application|tailored/i }).first().click();
    await expect(page).toHaveURL(new RegExp(`/applications/${applicationId}`));
    expect(await sql("manual", `SELECT id FROM "Application"`)).toHaveLength(1);
  });
});
