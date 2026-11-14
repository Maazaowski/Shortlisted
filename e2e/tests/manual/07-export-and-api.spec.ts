import { expect, test } from "@playwright/test";
import { sql } from "../../helpers.js";

const EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

test.describe("downloading your data", () => {
  test("the JSON export holds the bank, the applications and their history", async ({ page }) => {
    await page.goto("/settings");
    const downloading = page.waitForEvent("download");
    await page.getByRole("link", { name: "Everything as JSON" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^shortlisted-export-\d{4}-\d{2}-\d{2}\.json$/);
    const stream = await download.createReadStream();
    let text = "";
    for await (const chunk of stream) text += chunk;
    const data = JSON.parse(text);
    expect(data.profile.fullName).toBe("Sample Person");
    expect(data.bank).toHaveLength(3);
    expect(data.preferences.weeklyGoal).toBe(5);
    const ledgerly = data.applications.find((a: { rejectionReason: string | null }) => a.rejectionReason === "Went with an internal candidate");
    expect(ledgerly.stageEvents.length).toBeGreaterThanOrEqual(5);
    expect(ledgerly.notes[0].body).toContain("90 to 110k");
    expect(ledgerly.documents.length).toBe(4);
    // The role that was tailored from the job list is kept with the export.
    expect(data.savedListings.map((l: { company: string }) => l.company)).toContain("Kranz Mobility");
  });

  test("the spreadsheet export has one row per application", async ({ request }) => {
    const res = await request.get("/api/export?format=csv");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toMatch(/shortlisted-applications-.*\.csv/);
    const text = (await res.body()).toString("utf8");
    const lines = text.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Company,Role,Link,Stage,Fit,Fit score,Captured,Applied,Last change,Interview,Apply by,Contact,Contact email,Contact link,Rejection reason,Notes");
    const count = (await sql("manual", `SELECT id FROM "Application"`)).length;
    const row = lines.find((l) => l.startsWith("Ledgerly,Staff Backend Engineer"));
    expect(row).toContain("Rejected");
    expect(row).toContain("2026-11-20");
    expect(row).toContain("Dana Whitfield");
    expect(row).toContain("Went with an internal candidate");
    expect(text.split("Ledgerly,").length - 1).toBeGreaterThanOrEqual(1);
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("a note that starts like a formula is exported as text", async ({ request }) => {
    const [app] = await sql<{ id: string }>("manual", `SELECT id FROM "Application" ORDER BY "createdAt" LIMIT 1`);
    await sql("manual", `UPDATE "Application" SET "contactName" = '=HYPERLINK("http://bad.example","x")' WHERE id = $1`, [app!.id]);
    const text = (await (await request.get("/api/export?format=csv")).body()).toString("utf8");
    expect(text).toContain(`"'=HYPERLINK(""http://bad.example"",""x"")"`);
    await sql("manual", `UPDATE "Application" SET "contactName" = NULL WHERE id = $1`, [app!.id]);
  });
});

test.describe("the addresses the extension calls", () => {
  test("the extension counts as connected once it calls from its own origin", async ({ page, request }) => {
    await page.goto("/setup");
    await expect(page.getByText("3 of 4 done")).toBeVisible();
    await request.get("/api/me", { headers: { Origin: EXTENSION_ORIGIN } });
    await page.reload();
    await expect(page.getByText("3 of 4 done")).toHaveCount(0);
    await expect(page.getByRole("img", { name: "Not done" })).toHaveCount(0);
  });

  test("the health check answers and allows an extension origin", async ({ request }) => {
    const res = await request.get("/api/me", { headers: { Origin: EXTENSION_ORIGIN } });
    expect(res.status()).toBe(200);
    expect(res.headers()["access-control-allow-origin"]).toBe(EXTENSION_ORIGIN);
  });

  test("a web page on another site is not given access", async ({ request }) => {
    const res = await request.get("/api/me", { headers: { Origin: "https://evil.example" } });
    expect(res.headers()["access-control-allow-origin"]).toBeUndefined();
  });

  test("the preflight request is answered", async ({ request }) => {
    const res = await request.fetch("/api/applications", { method: "OPTIONS", headers: { Origin: EXTENSION_ORIGIN, "Access-Control-Request-Method": "POST" } });
    expect(res.status()).toBeLessThan(300);
    expect(res.headers()["access-control-allow-origin"]).toBe(EXTENSION_ORIGIN);
  });

  test("a capture with no text is refused with a sentence", async ({ request }) => {
    const res = await request.post("/api/applications", { data: { url: "https://jobs.example.com/x", pageTitle: "x", jsonLd: null, text: "too short" } });
    expect(res.status()).toBe(422);
    expect((await res.json()).error).toBe("Not enough text on this page to read a job posting.");
  });

  test("a capture that is not JSON is refused", async ({ request }) => {
    const res = await request.post("/api/applications", { data: "not json", headers: { "content-type": "text/plain" } });
    expect(res.status()).toBe(400);
  });

  test("looking up a page that was captured finds its application", async ({ request }) => {
    const res = await request.get(`/api/applications?url=${encodeURIComponent("https://jobs.example.com/ledgerly/staff-backend")}`);
    expect(res.status()).toBe(200);
    expect((await res.json()).job.company).toBe("Ledgerly");
    const none = await request.get(`/api/applications?url=${encodeURIComponent("https://jobs.example.com/never-seen")}`);
    expect(await none.json()).toBeNull();
  });

  for (const [method, path, data] of [
    ["GET", "/api/applications/nope", undefined],
    ["GET", "/api/applications/nope/prompt", undefined],
    ["POST", "/api/applications/nope/stage", { stage: "APPLIED" }],
    ["POST", "/api/applications/nope/notes", { body: "hello" }],
    ["POST", "/api/applications/nope/regenerate", { note: null }],
    ["POST", "/api/applications/nope/reply", { text: "{}" }],
    ["POST", "/api/applications/nope/details", { contactName: null, contactEmail: null, contactUrl: null, interviewAt: null, deadlineAt: null }],
    ["POST", "/api/applications/nope/cover-letter", { text: "hello" }],
    ["GET", "/api/documents/nope/file", undefined],
    ["POST", "/api/reminders/nope/done", undefined],
  ] as const) {
    test(`${method} ${path} for something that does not exist answers 404, not a crash`, async ({ request }) => {
      const res = await request.fetch(path, { method, data });
      expect(res.status(), await res.text()).toBe(404);
    });
  }

  test("an unknown stage name is refused", async ({ request }) => {
    const [app] = await sql<{ id: string }>("manual", `SELECT id FROM "Application" ORDER BY "createdAt" LIMIT 1`);
    const res = await request.post(`/api/applications/${app!.id}/stage`, { data: { stage: "HIRED" } });
    expect(res.status()).toBe(400);
  });

});
