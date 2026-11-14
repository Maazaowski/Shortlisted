import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { fixture, fixtureText, idFromUrl, posting, sql } from "../helpers.js";
import { REPO, STACKS, TMP } from "../stack.js";

/**
 * Records a captioned tour of the whole product. Not a test of anything: it
 * drives the two test stacks slowly and saves three clips to
 * e2e/.tmp/walkthrough, which walkthrough/join.mjs turns into one video.
 *
 *   1-app.webm        the web app, automatic mode then paste mode
 *   2-job.webm        the extension part: the job page
 *   2-panel.webm      the extension part: the side panel
 *
 * WT_SPEED scales every pause (0.05 for a quick dry run).
 */

const OUT = path.join(TMP, "walkthrough");
const SPEED = Number(process.env.WT_SPEED) || 1;
const AUTO = STACKS.cli.url;
const PASTE = STACKS.manual.url;
const SIZE = { width: 1280, height: 720 };

const wait = (page: Page, ms: number) => page.waitForTimeout(Math.max(30, ms * SPEED));

/** The caption bar survives page loads because its text rides in window.name. */
async function captions(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const draw = () => {
      if (!document.body) return;
      let data: { chapter?: string; text?: string } = {};
      try {
        data = window.name.startsWith("{") ? JSON.parse(window.name) : {};
      } catch {
        data = {};
      }
      let bar = document.getElementById("wt-caption");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "wt-caption";
        bar.setAttribute("aria-hidden", "true");
        bar.style.cssText =
          "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;max-width:min(960px,92vw);padding:12px 22px 14px;border-radius:14px;background:rgba(22,21,18,.94);color:#fff;font:500 19px/1.35 system-ui,Segoe UI,sans-serif;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.28);pointer-events:none";
        document.body.appendChild(bar);
      }
      bar.innerHTML = "";
      if (data.chapter) {
        const c = document.createElement("div");
        c.textContent = data.chapter;
        c.style.cssText = "font:600 11px/1 system-ui,Segoe UI,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#f0a488;margin-bottom:6px";
        bar.appendChild(c);
      }
      const t = document.createElement("div");
      t.textContent = data.text ?? "";
      bar.appendChild(t);
      bar.style.display = data.text ? "block" : "none";
    };
    (window as unknown as { __wtDraw: () => void }).__wtDraw = draw;
    document.addEventListener("DOMContentLoaded", draw);
    if (document.readyState !== "loading") draw();
  });
}

let chapter = "";

/** Shows a caption and holds long enough to read it. */
async function say(page: Page, text: string, ms?: number): Promise<void> {
  await page.evaluate(
    ([c, t]) => {
      window.name = JSON.stringify({ chapter: c, text: t });
      (window as unknown as { __wtDraw?: () => void }).__wtDraw?.();
    },
    [chapter, text],
  );
  await wait(page, ms ?? 1400 + text.length * 48);
}

/** Rings an element and brings it to the middle of the window. */
async function spot(target: Locator): Promise<void> {
  await target.first().evaluate((el) => {
    document.querySelectorAll("[data-wt-spot]").forEach((old) => {
      (old as HTMLElement).style.outline = "";
      old.removeAttribute("data-wt-spot");
    });
    const h = el as HTMLElement;
    h.setAttribute("data-wt-spot", "");
    h.style.outline = "3px solid #e5532d";
    h.style.outlineOffset = "5px";
    h.style.borderRadius = h.style.borderRadius || "6px";
    h.scrollIntoView({ block: "center", behavior: "smooth" });
  });
  await wait(target.page(), 700);
}

async function unspot(page: Page): Promise<void> {
  await page.evaluate(() =>
    document.querySelectorAll("[data-wt-spot]").forEach((old) => {
      (old as HTMLElement).style.outline = "";
      old.removeAttribute("data-wt-spot");
    }),
  );
}

async function top(page: Page): Promise<void> {
  await unspot(page);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await wait(page, 500);
}

async function card(page: Page, title: string, lines: string[], ms = 4200): Promise<void> {
  await page.evaluate(() => (window.name = ""));
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f6f3ec;color:#1a1915;font-family:Georgia,'Times New Roman',serif">
    <div style="font:600 13px system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#c8401a;margin-bottom:18px">Shortlisted</div>
    <h1 style="font-size:54px;font-weight:400;margin:0 0 22px;text-align:center;max-width:980px">${title}</h1>
    ${lines.map((l) => `<p style="font:400 21px/1.5 system-ui,sans-serif;color:#55524a;margin:4px 0;text-align:center;max-width:860px">${l}</p>`).join("")}
  </body>`);
  await wait(page, ms);
}

async function type(target: Locator, text: string): Promise<void> {
  await target.click();
  await target.fill("");
  await target.pressSequentially(text, { delay: Math.max(0, 28 * SPEED) });
}

const JOB_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Staff Backend Engineer - Quillfeather</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Staff Backend Engineer","hiringOrganization":{"@type":"Organization","name":"Quillfeather"},"jobLocationType":"TELECOMMUTE","datePosted":"2026-11-10","description":"<p>Quillfeather is hiring a Staff Backend Engineer for its payments ledger.</p>"}</script>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:36px auto;padding:0 24px;color:#1b1b1b;line-height:1.55}h1{margin:0}.co{color:#666;margin:4px 0 22px}form{border:1px solid #ddd;border-radius:12px;padding:20px;margin-top:26px}label{display:block;font-weight:600;margin:12px 0 6px}textarea{width:100%;box-sizing:border-box}button{margin-top:14px;padding:10px 18px;border:0;border-radius:8px;background:#1f4fd8;color:#fff;font-weight:600}</style></head>
<body><main>
<h1>Staff Backend Engineer</h1><p class="co">Quillfeather · Remote · quillfeather.example/careers</p>
<p>Role: Staff Backend Engineer<br>Company: Quillfeather<br>Location: Remote</p>
<p>Quillfeather is hiring a Staff Backend Engineer for its payments ledger. You will own the ledger service, design multi-currency accounting, and mentor engineers.</p>
<p>Must have: Postgres, TypeScript, Node, Docker.<br>Nice to have: Kubernetes, AWS.</p>
<form id="apply"><h2 style="margin:0">Apply for this job</h2>
<label for="resume">Resume</label><input type="file" name="resume" id="resume" accept=".pdf">
<label for="cover">Cover letter</label><textarea name="cover_letter" id="cover" rows="7"></textarea>
<button type="button">Submit application</button></form>
</main></body></html>`;

test("record the walkthrough", async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  // ---------------------------------------------------------------- the web app
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE }, permissions: ["clipboard-read", "clipboard-write"] });
  await captions(context);
  const page = await context.newPage();

  await card(page, "A walkthrough, start to finish", ["Find jobs you can apply to from your country.", "Get a resume and cover letter made for each one, from what you wrote.", "Keep track of every application. Free, and it runs on your own computer."], 6000);

  // 1. Setup
  chapter = "1 · Setup";
  await page.goto(`${AUTO}/`);
  await say(page, "The first time you open Shortlisted you land on a checklist. Four rows, each one checked for real.");
  await spot(page.getByRole("heading", { name: "A model to do the writing" }));
  await say(page, "Row one is the model that does the writing. Here it runs on your own Claude subscription.");
  await page.getByRole("button", { name: "Test it" }).click();
  await expect(page.getByRole("status").filter({ hasText: "It answered." })).toBeVisible({ timeout: 30_000 });
  await say(page, "Test it sends one short message to make sure the model answers.");

  // 2. Resume import
  chapter = "2 · Your resume";
  await spot(page.getByRole("link", { name: "Import your resume" }));
  await say(page, "Row two is your resume. This is where everything starts.");
  await page.getByRole("link", { name: "Import your resume" }).click();
  await page.waitForURL(/onboarding/);
  await say(page, "Upload the resume you send today, as a PDF or a Word file.");
  await page.locator('input[name="resume"]').setInputFiles(fixture("resume.pdf"));
  await spot(page.getByRole("button", { name: "Import and build my bank" }));
  await say(page, "One click reads it. The file itself is not kept.", 2600);
  await page.getByRole("button", { name: "Import and build my bank" }).click();
  await page.waitForURL(/\/bank$/, { timeout: 30_000 });

  // 3. Bank
  chapter = "3 · The experience bank";
  await say(page, "This is your bank. Every job and every line from your resume, one line at a time.");
  await spot(page.getByRole("heading", { name: "Senior Software Engineer at Acme Payments" }));
  await say(page, "Every resume Shortlisted makes is built only from these lines. It never makes up a job, a number or a skill.");
  const firstLine = page.locator("li", { has: page.locator('[aria-label="Bullet text"]') }).first();
  await spot(firstLine);
  await say(page, "Each line has its text, the skills it shows, and the number in it. You can edit and save any line.");
  await spot(page.getByLabel("New bullet text").first());
  await type(page.getByLabel("New bullet text").first(), "Ran the on-call rota for 6 engineers and cut pages by 30%");
  await page.getByLabel("Skills").nth(4).fill("incident response, on call");
  await say(page, "Add what the resume left out. Lead with what you did, and include a number.");
  await page.getByRole("button", { name: "Add bullet" }).first().click();
  await wait(page, 900);
  const role = page.locator("section", { has: page.getByRole("heading", { name: "Senior Software Engineer at Acme Payments" }) });
  await role.getByText("Edit details").click();
  await spot(role.locator("details"));
  await say(page, "Edit details fixes a job's title, place or dates without deleting it.");
  await role.getByText("Edit details").click();
  await top(page);
  await spot(page.getByRole("heading", { name: "Bank health" }).locator(".."));
  await say(page, "On the left: your name, contact details, summary, skills, education and certificates.");

  // 4. CV check
  chapter = "4 · CV check";
  await spot(page.getByRole("link", { name: "Check my CV" }));
  await wait(page, 600);
  await page.getByRole("link", { name: "Check my CV" }).click();
  await page.waitForURL(/bank\/check/);
  await say(page, "The CV check scores your bank out of 100 with fixed rules, with an eye on applying abroad.");
  await spot(page.getByRole("heading", { name: "Would make it stronger" }).locator("xpath=following-sibling::*[1]"));
  await say(page, "It lists what to fix, here a missing country and a missing LinkedIn link. It never changes anything itself.");
  await spot(page.getByRole("heading", { name: "Already in order" }).locator("xpath=following-sibling::*[1]"));
  await say(page, "And what is already fine: phone code, dates, numbers in your lines, length.");

  // 5. Settings
  chapter = "5 · Settings";
  await page.goto(`${AUTO}/settings?next=setup`);
  await say(page, "Settings decide which jobs you are shown. They stay on this computer.");
  await spot(page.getByLabel(/Country you live in/));
  await say(page, "Pick the country you live in and your passport. Any country works. Pakistan is the default.");
  await spot(page.getByRole("group", { name: "Pools" }));
  await say(page, "Three pools: Remote work from home, Relocate with visa help, and office jobs in the Gulf.");
  await spot(page.getByRole("group", { name: "Career fields" }));
  await say(page, "Sixteen career fields. Tick yours, or leave them all empty to see everything.");
  await spot(page.getByRole("textbox", { name: /^Job titles/ }));
  await page.getByRole("textbox", { name: /^Job titles/ }).fill("Backend Engineer\nPlatform Engineer");
  await page.getByLabel(/Applications per week/).fill("5");
  await say(page, "Type the job titles you are aiming for, and a weekly goal if you want one.");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.waitForURL(/\/setup/);
  await say(page, "Saved. The checklist now shows three of four done. The last row is the Chrome extension, shown at the end.");
  await page.getByRole("button", { name: "Appearance" }).click();
  await say(page, "Appearance switches light and dark, and the accent colour.", 2200);
  await page.getByRole("button", { name: "Dark" }).click();
  await wait(page, 1500);
  await page.getByRole("button", { name: "Moss" }).click();
  await wait(page, 1500);
  await page.getByRole("button", { name: "Light" }).click();
  await page.getByRole("button", { name: "Persimmon" }).click();
  await page.keyboard.press("Escape");
  await wait(page, 600);

  // 6. Jobs
  chapter = "6 · Finding jobs";
  await page.goto(`${AUTO}/jobs`);
  await say(page, "Jobs. Open roles from company job boards, refreshed every day. Links go straight to the employer.");
  await spot(page.getByRole("navigation", { name: "Pools" }));
  await say(page, "The tabs are your pools. Remote shows only roles that accept someone living in your country.");
  const firstRow = page.getByRole("main").getByRole("list").first().getByRole("listitem").first();
  await spot(firstRow);
  await say(page, "Each role carries tags worked out by rules from the posting's own words, and how many of its skills your bank has.");
  await page.getByLabel("Include unclear").check();
  await page.getByRole("button", { name: "Filter" }).click();
  await page.waitForURL(/unclear=1/);
  await say(page, "Include unclear adds remote roles that do not say which countries they accept. Old postings are marked as maybe stale.");
  await type(page.getByLabel("Search"), "engineer");
  await page.getByLabel("Order").selectOption("match");
  await spot(page.getByRole("button", { name: "Filter" }));
  await say(page, "Search by any word, filter by field, tech only or last 30 days, and order by best match.", 3000);
  await page.getByRole("button", { name: "Filter" }).click();
  await page.waitForURL(/sort=match/);
  await say(page, "Best match first puts the roles closest to your bank on top.");
  await page.getByRole("button", { name: /^Save Senior Backend Engineer/ }).click();
  await spot(page.getByRole("button", { name: /^Remove Senior Backend Engineer/ }));
  await say(page, "Save a role for later with the bookmark, or hide one you do not want.", 2600);
  await unspot(page);
  await page.getByRole("navigation", { name: "Pools" }).getByRole("link", { name: "Relocate" }).click();
  await page.waitForURL(/pool=relocate/);
  await say(page, "Relocate lists roles abroad where the posting itself says visa sponsorship or relocation support.");
  await page.getByRole("navigation", { name: "Pools" }).getByRole("link", { name: "Gulf" }).click();
  await page.waitForURL(/pool=gulf/);
  await say(page, "Gulf lists office roles in Saudi Arabia, the UAE, Qatar, Bahrain, Kuwait and Oman.");
  await page.goto(`${AUTO}/jobs?pool=relocate`);
  await page.getByRole("link", { name: /Platform Engineer/ }).click();
  await page.waitForURL(/\/jobs\/c/);
  await spot(page.getByRole("blockquote"));
  await say(page, "Open a role to see the exact sentence behind each tag. Nobody checked it by hand, and the page says so.");

  // 7. A role, key requirements, tailoring
  chapter = "7 · A role, and tailoring";
  await page.goto(`${AUTO}/jobs`);
  await page.getByRole("link", { name: /Senior Backend Engineer/ }).click();
  await page.waitForURL(/\/jobs\/c/);
  const listingId = idFromUrl(page);
  await spot(page.getByRole("link", { name: "Apply on the company's page" }));
  await say(page, "The main button opens the employer's own page. You always apply there yourself.");
  await spot(page.getByRole("button", { name: "Read the key requirements" }));
  await say(page, "Read the key requirements sorts what the posting asks for into must-have and nice-to-have.", 3000);
  await page.getByRole("button", { name: "Read the key requirements" }).click();
  await expect(page.getByText(/Must have, \d of \d in your bank/)).toBeVisible({ timeout: 30_000 });
  await spot(page.getByRole("heading", { name: "Key requirements" }).locator(".."));
  await say(page, "A green dot means your bank already shows that skill. Kubernetes is missing here.");
  await spot(page.getByRole("heading", { name: "Skills named in the posting" }).locator(".."));
  await say(page, "Below it, every skill found in the posting, split into what you have and what you do not.");
  await top(page);
  await spot(page.getByRole("button", { name: "Tailor my resume" }));
  await say(page, "Tailor my resume builds a resume and a cover letter for this role from your bank.", 2800);
  await page.getByRole("button", { name: "Tailor my resume" }).click();
  await page.waitForURL(/\/applications\//);
  const appId = idFromUrl(page);
  await say(page, "About twenty seconds of work: read the posting, score the fit, pick your lines, check them, make the PDFs.", 2500);
  await expect(page.getByRole("heading", { name: /^Resume v\d+$/ })).toBeVisible({ timeout: 60_000 });

  // 8. The application page
  chapter = "8 · The result";
  await top(page);
  await say(page, "Done. At the top: the stage, and a fit score worked out by code before anything is written.");
  await spot(page.getByRole("heading", { name: "Your bank against what the posting asks for" }).locator(".."));
  await say(page, "Which must-haves your bank covers, and which nice-to-haves.");
  await spot(page.getByRole("heading", { name: "What changed versus your base resume" }).locator(".."));
  await say(page, "What changed against your normal resume, so you review a short list and not a whole document.");
  await spot(page.locator('iframe[title="Resume preview"]'));
  await say(page, "The resume, as a PDF you can download. One column, plain text, easy for screening software to read.");
  await page.screenshot({ path: path.join(OUT, "check-resume.png") });
  await spot(page.getByRole("heading", { name: "Cover letter" }).locator("xpath=ancestor::section[1]"));
  await say(page, "The cover letter. Copy the text or download it as a PDF.");
  await page.getByRole("button", { name: "Edit" }).click();
  const letter = page.getByLabel("Cover letter text");
  await letter.fill((await letter.inputValue()) + "\n\nAt Globex I grew revenue by 250% on Kubernetes.");
  await spot(letter);
  await say(page, "You can edit it. Watch what happens when a sentence claims something your bank does not say.");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText("Check these before you send")).toBeVisible({ timeout: 30_000 });
  await spot(page.getByText("Check these before you send").locator(".."));
  await say(page, "It is flagged. 250%, Globex and Kubernetes are not in your bank, so you are told before you send it.");

  chapter = "9 · Tracking the application";
  await spot(page.getByRole("heading", { name: "Messages to send" }).locator("xpath=ancestor::section[1]"));
  await say(page, "Messages to send. Ready templates filled with this job, for the step you are on. You send them yourself.");
  await page.getByRole("button", { name: "All five" }).click();
  await wait(page, 500);
  await spot(page.getByRole("heading", { name: "Reply to a rejection" }));
  await say(page, "All five: the day you apply, a follow-up after ten days, a thank-you, a check-in, and a reply to a rejection.");
  await spot(page.getByRole("heading", { name: "Regenerate" }).locator(".."));
  await type(page.getByLabel("Regenerate instruction"), "Lead with the ledger work");
  await say(page, "Not happy with it? Regenerate, with an instruction if you like. Each run is a new version.", 3200);
  await page.getByLabel("Regenerate instruction").fill("");

  await spot(page.getByRole("heading", { name: "Stage" }).locator(".."));
  await say(page, "On the right, the stage. After you apply on the company's page, mark it yourself.");
  await page.getByRole("button", { name: "Mark Applied" }).click();
  await expect(page.getByRole("button", { name: "Mark Screening" })).toBeVisible();
  await say(page, "Applied. Shortlisted never marks this for you, because only you know you applied.", 2800);
  await spot(page.getByRole("heading", { name: "Contact and dates" }).locator(".."));
  await type(page.getByLabel("Contact name"), "Dana Whitfield");
  await type(page.getByLabel("Contact email"), "dana@ledgerly.example");
  await page.getByLabel("Interview").fill("2026-11-20");
  await page.getByLabel("Apply by").fill("2026-11-30");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await say(page, "Keep a contact and dates. Contacts are never guessed. Search links help you find a real person.");
  await spot(page.getByRole("heading", { name: "Notes" }).locator(".."));
  await type(page.getByLabel("New note"), "Recruiter said the range is 90 to 110k");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await say(page, "Notes for anything you want to remember.", 2200);
  await spot(page.getByRole("heading", { name: "Timeline" }).locator(".."));
  await say(page, "The timeline keeps every stage change with its date.", 2400);
  await spot(page.getByRole("heading", { name: "Messages to send" }).locator("xpath=ancestor::section[1]"));
  await say(page, "The messages now greet Dana by name, and Open in mail starts the email for you.");

  // 9b. A poor fit
  chapter = "10 · Paste a posting, and a poor fit";
  await page.goto(`${AUTO}/generate`);
  await say(page, "Paste is for a posting someone sent you, or a site the extension cannot read.");
  await page.getByLabel("Posting text").fill(posting({ title: "Registered Nurse", company: "Northwind Hospital", location: "Leeds", must: ["Nursing", "Phlebotomy", "Triage", "Patient care"] }));
  await say(page, "Here is a nursing job, pasted in for a software engineer.", 2400);
  await page.getByRole("button", { name: "Tailor" }).click();
  await expect(page.getByText("Poor fit. Nothing generated.")).toBeVisible({ timeout: 45_000 });
  await say(page, "Poor fit. It stops before writing anything, and shows the must-haves your bank does not cover.");
  await spot(page.getByRole("button", { name: "Regenerate" }));
  await say(page, "If you do have one of those skills, add it to your bank and try again.", 2800);

  // 10. Board
  chapter = "11 · The board";
  await sql("cli", `UPDATE "StageEvent" SET "createdAt" = "createdAt" - interval '11 days' WHERE "applicationId" = $1`, [appId]);
  await page.goto(`${AUTO}/board`);
  await say(page, "The board. One column per stage, from Saved to Offer, plus Rejected and Withdrawn.");
  await spot(page.getByRole("link", { name: /Senior Backend Engineer at Ledgerly/ }).last());
  await say(page, "The card shows the fit, the interview date and the last day to apply.");
  await spot(page.getByRole("heading", { name: "Follow up" }).locator(".."));
  await say(page, "Ten quiet days after applying, the job shows up under Follow up. Send the follow-up message, then press Done.");
  await page.getByRole("heading", { name: "Follow up" }).locator("..").getByRole("button", { name: "Done" }).click();
  await wait(page, 1200);
  await page.goto(`${AUTO}/applications/${appId}`);
  await page.getByLabel("Set stage").selectOption("INTERVIEW");
  await expect(page.getByRole("button", { name: "Mark Offer" })).toBeVisible();
  await spot(page.getByRole("heading", { name: "Stage" }).locator(".."));
  await say(page, "Move the stage as things happen. Here it goes to Interview, and the thank-you note is offered.");

  // 11. Dashboard
  chapter = "12 · Dashboard";
  await page.goto(`${AUTO}/dashboard`);
  await say(page, "The dashboard tells you whether the search is working: sent, in play, and how many got a reply.");
  await spot(page.getByRole("heading", { name: "Applied per week" }).locator(".."));
  await say(page, "Applications per week, against the weekly goal you set.");
  await spot(page.getByRole("heading", { name: "Response rate by fit" }).locator(".."));
  await say(page, "And the reply rate by fit, so you learn which roles are worth your time.");

  // 12. Export
  chapter = "13 · Your data";
  await page.goto(`${AUTO}/settings`);
  await spot(page.getByRole("heading", { name: "Your data" }).locator(".."));
  await say(page, "The only copy of your data is on your computer. Download everything as a file, or your applications as a spreadsheet.");

  // 13. Paste mode
  chapter = "14 · No subscription? Paste mode";
  await card(page, "No paid plan? Paste mode", ["The same product, free, with any chat assistant.", "You copy a prompt out and paste the reply back."], 4500);
  await page.goto(`${PASTE}/onboarding`);
  await page.locator('input[name="resume"]').setInputFiles(fixture("resume.pdf"));
  await page.getByRole("button", { name: "Import and build my bank" }).click();
  await expect(page.getByRole("button", { name: "Copy prompt" })).toBeVisible();
  await spot(page.getByRole("button", { name: "Copy prompt" }));
  await say(page, "In paste mode, importing a resume gives you a prompt. Copy it and paste it into Claude or any assistant.");
  await page.getByRole("button", { name: "Copy prompt" }).click();
  await page.getByLabel("Pasted reply").fill("```json\n" + fixtureText("bank.json") + "\n```");
  await spot(page.getByLabel("Pasted reply"));
  await say(page, "Then paste the whole reply back. It is checked before anything is saved.");
  await page.getByRole("button", { name: "Build my bank" }).click();
  await page.waitForURL(/\/bank$/);
  await page.goto(`${PASTE}/generate`);
  await page.getByLabel("Posting text").fill(posting({ title: "Staff Backend Engineer", company: "Ledgerly", must: ["Postgres", "TypeScript", "Node", "Docker"], nice: ["Kubernetes", "AWS"] }));
  await page.getByRole("button", { name: "Tailor" }).click();
  await page.waitForURL(/\/applications\//);
  await spot(page.getByRole("heading", { name: "Your turn" }).locator(".."));
  await say(page, "Tailoring works the same way. Copy the prompt, paste the reply. About a minute per job.");
  await page.getByLabel("Pasted reply").fill(fixtureText("selection-reply.txt"));
  await page.getByRole("button", { name: "Submit reply" }).click();
  await expect(page.getByRole("heading", { name: /^Resume v\d+$/ })).toBeVisible({ timeout: 60_000 });
  await spot(page.getByText("Flagged by validation").locator(".."));
  await say(page, "The same checks run. Here the assistant added the number 3 to a line, and it is flagged, not hidden.");

  await card(page, "Last part: the Chrome extension", ["One click on any job page.", "Then one more click to attach the files to the form."], 4200);
  const video = page.video();
  await context.close();
  renameSync(await video!.path(), path.join(OUT, "1-app.webm"));
  void listingId;

  // ---------------------------------------------------------------- the extension
  chapter = "15 · The Chrome extension";
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(JOB_PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const jobUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/careers/staff-backend-engineer`;
  const EXT = path.join(REPO, "apps", "extension", "dist");
  const JOB_SIZE = { width: 900, height: 720 };
  const ext = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: JOB_SIZE,
    recordVideo: { dir: path.join(OUT, "ext"), size: JOB_SIZE },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  await captions(ext);
  const worker = ext.serviceWorkers()[0] ?? (await ext.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;
  for (const p of ext.pages()) await p.close();

  const job = await ext.newPage();
  const panel = await ext.newPage();
  const started = Date.now();
  // Tabs in one window share its size, so the panel page is kept narrow with a style and cropped when the clips are joined.
  await panel.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "html{width:380px;min-height:100vh;border-right:1px solid #d9d4c7}";
      document.head.appendChild(style);
    });
  });
  await job.goto(jobUrl);
  await job.bringToFront();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.evaluate((apiBase) => chrome.storage.local.set({ apiBase }), AUTO);
  await job.bringToFront();
  await panel.reload();
  const press = (selector: string) => panel.locator(selector).dispatchEvent("click");

  await expect(panel.locator("#ready")).toBeVisible();
  await say(job, "Any job page in Chrome. Click the Shortlisted icon and the side panel opens next to it.");
  await say(job, "One click on Tailor for this page reads the posting. Nothing is typed or pasted.", 3000);
  await press("#capture");
  await expect(panel.locator("#attach")).toBeEnabled({ timeout: 60_000 });
  await say(job, "The panel shows the fit, the stage, what changed, and any flags.");
  await panel.evaluate(() => window.scrollTo({ top: 400, behavior: "smooth" }));
  await say(job, "The same result as in the web app, right beside the job.", 2600);
  await panel.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await spot(job.locator("#apply"));
  await say(job, "Now the application form. Attach puts the resume into the upload box and the letter into its text box.");
  await press("#attach");
  await expect(panel.locator("#status")).toHaveText("Resume attached and cover letter filled.", { timeout: 30_000 });
  await say(job, "Both are filled in. You check the form and press submit yourself.");
  await press('[data-stage="APPLIED"]');
  await wait(job, 1200);
  await say(job, "Then mark it Applied from the panel, and it moves on your board.");
  await unspot(job);
  await say(job, "That is Shortlisted: find a role, tailor your documents, apply yourself, and keep track.", 4200);

  const jobVideo = job.video();
  const panelVideo = panel.video();
  await ext.close();
  server.close();
  renameSync(await jobVideo!.path(), path.join(OUT, "2-job.webm"));
  renameSync(await panelVideo!.path(), path.join(OUT, "2-panel.webm"));
  writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ recordedAt: new Date(started).toISOString(), speed: SPEED }));
});
