import { expect, test, type Page } from "@playwright/test";
import { sql } from "../../helpers.js";

async function applicationId(company: string): Promise<string> {
  const [row] = await sql<{ id: string }>("manual", `SELECT a.id FROM "Application" a JOIN "Job" j ON j.id = a."jobId" WHERE j.company = $1 ORDER BY a."createdAt" LIMIT 1`, [company]);
  if (!row) throw new Error(`no application for ${company}`);
  return row.id;
}

const stageOf = async (id: string) => (await sql<{ stage: string }>("manual", `SELECT stage FROM "Application" WHERE id = $1`, [id]))[0]?.stage;
const messages = (page: Page) => page.getByRole("heading", { name: "Messages to send" }).locator("xpath=ancestor::section[1]");

test.describe("tracking an application", () => {
  let id = "";
  test.beforeAll(async () => {
    id = await applicationId("Ledgerly");
  });

  test("before applying, the message on offer is the note for the day you apply", async ({ page }) => {
    await page.goto(`/applications/${id}`);
    await expect(messages(page).getByRole("heading", { level: 3 })).toHaveText(["Note on the day you apply"]);
    await expect(messages(page)).toContainText("I have just applied for the Staff Backend Engineer role at Ledgerly");
    await expect(messages(page)).toContainText("Sample Person");

    await page.getByRole("button", { name: "All five" }).click();
    await expect(messages(page).getByRole("heading", { level: 3 })).toHaveText([
      "Note on the day you apply",
      "Follow-up after ten days",
      "Thank-you after an interview",
      "Check-in after a quiet interview",
      "Reply to a rejection",
    ]);
  });

  test("mark applied moves the card and counts on the dashboard", async ({ page }) => {
    await page.goto(`/applications/${id}`);
    await page.getByRole("button", { name: "Mark Applied" }).click();
    await expect(page.getByRole("button", { name: "Mark Screening" })).toBeVisible();
    expect(await stageOf(id)).toBe("APPLIED");
    await expect(page.getByRole("heading", { name: "Timeline" }).locator("..")).toContainText("Applied");

    await page.goto("/board");
    await expect(page.getByRole("region", { name: "Applied" }).getByRole("link", { name: "Staff Backend Engineer at Ledgerly" })).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByText("This week: 1 of 5. 4 to go.")).toBeVisible();
    await expect(page.getByRole("img", { name: "1 of 5 applications this week" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Applied" }).first()).toContainText("1");
  });

  test("a note is kept with its date", async ({ page }) => {
    await page.goto(`/applications/${id}`);
    await page.getByLabel("New note").fill("Recruiter said the range is 90 to 110k");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Recruiter said the range is 90 to 110k")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Recruiter said the range is 90 to 110k")).toBeVisible();
  });

  test("a contact with a bad email or link is refused", async ({ page }) => {
    await page.goto(`/applications/${id}`);
    await page.getByLabel("Contact name").fill("Dana Whitfield");
    await page.getByLabel("Contact email").fill("dana@");
    await page.getByLabel("Contact email").evaluate((el: HTMLInputElement) => (el.type = "text"));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "That email address does not look right." })).toBeVisible();
    expect((await sql<{ contactName: string | null }>("manual", `SELECT "contactName" FROM "Application" WHERE id = $1`, [id]))[0]?.contactName).toBeNull();
  });

  test("a contact and dates are saved, fill the messages, and show on the board", async ({ page }) => {
    await page.goto(`/applications/${id}`);
    await page.getByLabel("Contact name").fill("Dana Whitfield");
    await page.getByLabel("Contact email").fill("dana@ledgerly.example");
    await page.getByLabel("Contact link").fill("https://www.linkedin.com/in/dana-whitfield");
    await page.getByLabel("Interview").fill("2026-11-20");
    await page.getByLabel("Apply by").fill("2026-11-30");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

    await expect(messages(page)).toContainText("Hi Dana,");
    const mail = messages(page).getByRole("link", { name: "Open in mail" }).first();
    await expect(mail).toHaveAttribute("href", /^mailto:dana@ledgerly\.example\?subject=/);

    await page.goto("/board");
    const card = page.getByRole("link", { name: "Staff Backend Engineer at Ledgerly" });
    await expect(card).toContainText("Interview 20 Nov");
    await expect(card).toContainText("Apply by 30 Nov");
  });

  test("an edited cover letter is checked against the bank and rendered again", async ({ page, request }) => {
    await page.goto(`/applications/${id}`);
    await page.getByRole("button", { name: "Edit" }).click();
    const box = page.getByLabel("Cover letter text");
    await box.fill((await box.inputValue()) + "\n\nAt Globex I grew revenue by 250% on Kubernetes.");
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(page.getByText("Edited by you. Regenerate replaces it with a new version.")).toBeVisible();
    await expect(page.getByText("Check these before you send")).toBeVisible();
    const flags = page.getByText("Check these before you send").locator("..");
    await expect(flags).toContainText("250%");
    await expect(flags).toContainText(/kubernetes/i);
    await expect(flags).toContainText(/globex/i);

    const cover = await request.get((await page.getByRole("link", { name: "PDF", exact: true }).getAttribute("href"))!);
    expect(cover.status()).toBe(200);
    expect((await cover.body()).subarray(0, 4).toString()).toBe("%PDF");
  });

  test("an empty cover letter cannot be saved", async ({ page }) => {
    await page.goto(`/applications/${id}`);
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Cover letter text").fill("   ");
    await expect(page.getByRole("button", { name: "Save", exact: true }).first()).toBeDisabled();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Dear hiring team").first()).toBeVisible();
  });

  test("ten quiet days in Applied raise one follow-up, and Done clears it", async ({ page }) => {
    await page.goto("/board");
    await expect(page.getByRole("heading", { name: "Follow up" })).toHaveCount(0);

    await sql("manual", `UPDATE "StageEvent" SET "createdAt" = "createdAt" - interval '11 days' WHERE "applicationId" = $1`, [id]);
    await page.goto("/board");
    const followUp = page.getByRole("heading", { name: "Follow up" }).locator("..");
    await expect(followUp).toContainText("Staff Backend Engineer");
    await expect(followUp).toContainText("quiet for 11 days");
    await expect(page.getByRole("link", { name: "Staff Backend Engineer at Ledgerly" })).toContainText("Follow up");

    // Reading the board again does not make a second reminder.
    await page.reload();
    expect(await sql("manual", `SELECT id FROM "Reminder" WHERE "applicationId" = $1`, [id])).toHaveLength(1);

    await page.goto(`/applications/${id}`);
    await expect(page.getByText("Ten days in Applied with no change. Time to follow up.")).toBeVisible();
    await expect(messages(page).getByRole("heading", { level: 3 }).first()).toHaveText("Follow-up after ten days");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Ten days in Applied with no change.")).toHaveCount(0);

    await page.goto("/board");
    await expect(page.getByRole("heading", { name: "Follow up" })).toHaveCount(0);
    expect(await sql("manual", `SELECT id FROM "Reminder" WHERE "applicationId" = $1`, [id])).toHaveLength(1);
  });

  test("the stage list moves it to interview and offers the thank-you note", async ({ page }) => {
    await page.goto(`/applications/${id}`);
    await page.getByLabel("Set stage").selectOption("INTERVIEW");
    await expect(page.getByRole("button", { name: "Mark Offer" })).toBeVisible();
    expect(await stageOf(id)).toBe("INTERVIEW");
    await expect(messages(page).getByRole("heading", { level: 3 })).toHaveText(["Thank-you after an interview", "Check-in after a quiet interview"]);
    await expect(messages(page)).toContainText("20 November");

    await page.goto("/dashboard");
    await expect(page.getByRole("main")).toContainText("100%");
  });

  test("rejected asks for a reason and offers the reply that keeps the door open", async ({ page }) => {
    await page.goto(`/applications/${id}`);
    await page.getByRole("button", { name: "Rejected" }).click();
    await page.getByPlaceholder("Optional").fill("Went with an internal candidate");
    await page.getByRole("button", { name: "Mark rejected" }).click();
    await expect.poll(() => stageOf(id)).toBe("REJECTED");
    await expect(page.getByRole("main")).toContainText("Went with an internal candidate");
    await expect(messages(page).getByRole("heading", { level: 3 })).toHaveText(["Reply to a rejection"]);

    await page.goto("/board");
    await expect(page.getByRole("region", { name: "Rejected" }).getByRole("link", { name: "Staff Backend Engineer at Ledgerly" })).toBeVisible();
  });

  test("every stage change is in the history, in order", async () => {
    const events = await sql<{ toStage: string }>("manual", `SELECT "toStage" FROM "StageEvent" WHERE "applicationId" = $1 ORDER BY "createdAt"`, [id]);
    expect(events.map((e) => e.toStage)).toEqual(["SAVED", "GENERATED", "APPLIED", "INTERVIEW", "REJECTED"]);
  });

  test("withdraw moves another application out of play", async ({ page }) => {
    const other = await applicationId("Fennel Finance");
    await page.goto(`/applications/${other}`);
    await page.getByRole("button", { name: "Withdraw" }).click();
    await expect.poll(() => stageOf(other)).toBe("WITHDRAWN");
    await page.goto("/board");
    await expect(page.getByRole("region", { name: "Withdrawn" }).getByRole("link", { name: /Fennel Finance/ })).toBeVisible();
  });
});
