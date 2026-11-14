import { expect, test } from "@playwright/test";
import { fixtureText, idFromUrl, posting, sql, waitForDocuments } from "../../helpers.js";

/** The fixture reply as an object, so a test can bend it. */
function replyObject(): { parsed: Record<string, unknown>; selection: { entries: { entryId: string; bullets: { id: string; rewording: string | null }[] }[]; coverLetter: string } & Record<string, unknown> } {
  const text = fixtureText("selection-reply.txt");
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

const LEDGERLY_URL = "https://jobs.example.com/ledgerly/staff-backend";
const ledgerlyText = posting({ title: "Staff Backend Engineer", company: "Ledgerly", must: ["Postgres", "TypeScript", "Node", "Docker"], nice: ["Kubernetes", "AWS"] });
let ledgerlyId = "";

test.describe("tailoring a resume in paste mode", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("a posting that is too short cannot be sent", async ({ page }) => {
    await page.goto("/generate");
    await page.getByLabel("Posting text").fill("Engineer wanted.");
    const tailor = page.getByRole("button", { name: "Tailor" });
    if (await tailor.isEnabled()) {
      await tailor.click();
      await expect(page.getByRole("alert").filter({ hasText: "Paste the full posting." })).toBeVisible();
    }
    await expect(page).toHaveURL(/\/generate$/);
  });

  test("a pasted posting waits for the reply and shows on the board", async ({ page }) => {
    await page.goto("/generate");
    await page.getByLabel("Posting URL").fill(LEDGERLY_URL);
    await page.getByLabel("Posting text").fill(ledgerlyText);
    await page.getByRole("button", { name: "Tailor" }).click();
    await page.waitForURL(/\/applications\//);
    ledgerlyId = idFromUrl(page);
    await expect(page.getByRole("heading", { name: "Your turn" })).toBeVisible();

    await page.goto("/board");
    await expect(page.getByRole("region", { name: "Saved" })).toContainText("Needs your reply");
  });

  test("the prompt holds the bank under short labels and the posting", async ({ page }) => {
    await page.goto(`/applications/${ledgerlyId}`);
    await page.getByRole("button", { name: "Copy prompt" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    expect(prompt).toContain("### e1: Senior Software Engineer, Acme Payments");
    expect(prompt).toContain("- b1: Built a double-entry ledger");
    expect(prompt).toContain("- c1: AWS Certified Developer");
    expect(prompt).toContain("Ledgerly is hiring a Staff Backend Engineer");
    // Database ids never reach the prompt.
    expect(prompt).not.toMatch(/\bc[a-z0-9]{24}\b/);
  });

  test("a reply that cannot be read is refused with the reason", async ({ page }) => {
    await page.goto(`/applications/${ledgerlyId}`);
    await page.getByLabel("Pasted reply").fill("I could not find a posting.");
    await page.getByRole("button", { name: "Submit reply" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "No JSON object found" })).toBeVisible();

    await page.getByLabel("Pasted reply").fill('{"parsed": {"isJobPosting": true}}');
    await page.getByRole("button", { name: "Submit reply" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "does not match the expected shape" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your turn" })).toBeVisible();
  });

  test("a good reply produces both documents and moves the stage to Generated", async ({ page, request }) => {
    await page.goto(`/applications/${ledgerlyId}`);
    await page.getByLabel("Pasted reply").fill(fixtureText("selection-reply.txt"));
    await page.getByRole("button", { name: "Submit reply" }).click();

    const resume = page.getByRole("link", { name: "Sample Person - Staff Backend Engineer - Ledgerly.pdf" });
    await expect(resume).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("heading", { name: "Staff Backend Engineer", level: 1 })).toBeVisible();
    await expect(page.getByRole("main")).toContainText("Strong fit");
    await expect(page.getByText("Must-haves your bank covers, 4 of 4")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Resume v1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark Applied" })).toBeVisible();

    // The rewording that added a number is flagged, not fixed silently.
    await expect(page.getByText('"3" is not in the original bullet.')).toBeVisible();
    await expect(page.getByText("Added number", { exact: true })).toBeVisible();
    await expect(page.getByText("added_number")).toHaveCount(0);
    // What changed against the base resume is listed.
    await expect(page.getByRole("heading", { name: "What changed versus your base resume" })).toBeVisible();
    await expect(page.getByText("Designed and built a double-entry ledger")).toBeVisible();

    const pdf = await request.get((await resume.getAttribute("href"))!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

    const cover = await request.get((await page.getByRole("link", { name: "PDF", exact: true }).getAttribute("href"))!);
    expect(cover.status()).toBe(200);
    expect((await cover.body()).subarray(0, 4).toString()).toBe("%PDF");

    const [app] = await sql<{ stage: string; generationStatus: string; covered: string[] }>("manual", `SELECT stage, "generationStatus", covered FROM "Application" WHERE id = $1`, [ledgerlyId]);
    expect(app?.stage).toBe("GENERATED");
    expect(app?.generationStatus).toBe("DONE");
    expect(app?.covered).toEqual(["postgres", "typescript", "node", "docker"]);
  });

  test("the cover letter can be copied", async ({ page }) => {
    await page.goto(`/applications/${ledgerlyId}`);
    await page.getByRole("heading", { name: "Cover letter" }).locator("..").getByRole("button", { name: "Copy" }).click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("Dear hiring team");
    expect(text).toContain("Sample Person");
  });

  test("the same posting again opens the application that exists", async ({ page }) => {
    await page.goto("/generate");
    await page.getByLabel("Posting text").fill(ledgerlyText);
    await page.getByRole("button", { name: "Tailor" }).click();
    await expect(page).toHaveURL(new RegExp(`/applications/${ledgerlyId}$`));

    // The same address with different text is recognised too.
    await page.goto("/generate");
    await page.getByLabel("Posting URL").fill(LEDGERLY_URL);
    await page.getByLabel("Posting text").fill(posting({ title: "Staff Backend Engineer", company: "Ledgerly", must: ["Postgres"] }));
    await page.getByRole("button", { name: "Tailor" }).click();
    await expect(page).toHaveURL(new RegExp(`/applications/${ledgerlyId}$`));
  });

  test("regenerate with an instruction asks again and makes version two", async ({ page }) => {
    await page.goto(`/applications/${ledgerlyId}`);
    await page.getByLabel("Regenerate instruction").fill("Lead with the ledger work");
    await page.getByRole("button", { name: "Regenerate" }).click();
    await expect(page.getByRole("heading", { name: "Your turn" })).toBeVisible();

    await page.getByRole("button", { name: "Copy prompt" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Instruction from the candidate for this regeneration: Lead with the ledger work");

    await page.getByLabel("Pasted reply").fill(fixtureText("selection-reply.txt"));
    await page.getByRole("button", { name: "Submit reply" }).click();
    await expect(page.getByRole("heading", { name: "Resume v2" })).toBeVisible({ timeout: 45_000 });
    // Regenerating never moves the stage back.
    await expect(page.getByRole("button", { name: "Mark Applied" })).toBeVisible();
    expect(await sql("manual", `SELECT id FROM "Document" WHERE "applicationId" = $1`, [ledgerlyId])).toHaveLength(4);
  });

  test("labels the bank does not have are dropped and flagged", async ({ page }) => {
    const reply = replyObject();
    reply.parsed.title = "Ledger Engineer";
    reply.parsed.company = "Fennel Finance";
    reply.selection.entries[0]!.bullets.push({ id: "b99", rewording: null });
    reply.selection.entries.push({ entryId: "e9", bullets: [{ id: "b1", rewording: null }] });

    await page.goto("/generate");
    await page.getByLabel("Posting text").fill(posting({ title: "Ledger Engineer", company: "Fennel Finance", must: ["Postgres", "TypeScript"] }));
    await page.getByRole("button", { name: "Tailor" }).click();
    await expect(page.getByRole("heading", { name: "Your turn" })).toBeVisible();
    await page.getByLabel("Pasted reply").fill(JSON.stringify(reply));
    await page.getByRole("button", { name: "Submit reply" }).click();
    await waitForDocuments(page);
    await page.waitForURL(/\/applications\//);
    const flags = (await sql<{ flags: { kind: string }[] }>("manual", `SELECT flags FROM "Document" WHERE "applicationId" = $1 AND type = 'RESUME'`, [idFromUrl(page)]))[0]!.flags.map((f) => f.kind);
    expect(flags).toContain("missing_bullet");
    expect(flags).toContain("missing_entry");
    await expect(page.getByText("Flagged by validation")).toBeVisible();
  });

  test("a reply that says the page is not a job posting ends with a sentence, not documents", async ({ page }) => {
    const reply = replyObject();
    reply.parsed.isJobPosting = false;
    reply.parsed.title = "Cooking rice";
    reply.parsed.company = "A food blog";
    await page.goto("/generate");
    await page.getByLabel("Posting text").fill("This is a blog post about cooking rice. ".repeat(6) + Math.random());
    await page.getByRole("button", { name: "Tailor" }).click();
    await page.waitForURL(/\/applications\//);
    const id = idFromUrl(page);
    await page.getByLabel("Pasted reply").fill(JSON.stringify(reply));
    await page.getByRole("button", { name: "Submit reply" }).click();
    await expect(page.getByText("This page does not look like a single job posting.")).toBeVisible({ timeout: 45_000 });
    const [app] = await sql<{ generationStatus: string; stage: string }>("manual", `SELECT "generationStatus", stage FROM "Application" WHERE id = $1`, [id]);
    expect(app).toEqual({ generationStatus: "FAILED", stage: "SAVED" });
  });
});
