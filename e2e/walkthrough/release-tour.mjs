// Records the release walkthrough: publishing a version, a new user
// installing it, publishing an update, and the user updating.
//
//   node walkthrough/release-tour.mjs install <logs dir> <app url> <out dir>
//   node walkthrough/release-tour.mjs update1 <logs dir> <app url> <out dir>   (before the user updates)
//   node walkthrough/release-tour.mjs update2 <logs dir> <app url> <out dir>   (after)
//
// The browser parts are live: GitHub's public pages and a real install of the
// published image. The terminal parts replay output captured from the real
// commands by walkthrough/capture.mjs, with quiet stretches shortened.
import { mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const [phase, LOGS, APP, OUT] = process.argv.slice(2);
if (!["install", "update1", "update2"].includes(phase) || !LOGS || !APP || !OUT) {
  console.error("usage: release-tour.mjs install|update1|update2 <logs dir> <app url> <out dir>");
  process.exit(2);
}
const HERE = import.meta.dirname;
const REPO = "https://github.com/Maazaowski/Shortlisted";
const SIZE = { width: 1280, height: 720 };
const SPEED = Number(process.env.WT_SPEED) || 1;
const log = (name) => JSON.parse(readFileSync(path.join(LOGS, name), "utf8"));
const TERMINAL = pathToFileURL(path.join(HERE, "terminal.html")).toString();

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chromium", headless: true });
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE }, colorScheme: "light" });
context.setDefaultTimeout(30_000);

await context.addInitScript(() => {
  const draw = () => {
    if (!document.body) return;
    let data = {};
    try {
      data = window.name.startsWith("{") ? JSON.parse(window.name) : {};
    } catch {
      data = {};
    }
    let bar = document.getElementById("wt-caption");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "wt-caption";
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
  window.__wtDraw = draw;
  document.addEventListener("DOMContentLoaded", draw);
  if (document.readyState !== "loading") draw();
});

const page = await context.newPage();
let chapter = "";
const wait = (ms) => page.waitForTimeout(Math.max(30, ms * SPEED));

async function say(text, ms) {
  await page.evaluate(
    ([c, t]) => {
      window.name = JSON.stringify({ chapter: c, text: t });
      window.__wtDraw?.();
    },
    [chapter, text],
  );
  await wait(ms ?? 1500 + text.length * 50);
}

async function spot(target) {
  await target.first().evaluate((el) => {
    document.querySelectorAll("[data-wt-spot]").forEach((old) => {
      old.style.outline = "";
      old.removeAttribute("data-wt-spot");
    });
    el.setAttribute("data-wt-spot", "");
    el.style.outline = "3px solid #e5532d";
    el.style.outlineOffset = "5px";
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  });
  await wait(800);
}

async function card(title, lines, ms = 5000) {
  await page.goto("about:blank");
  await page.evaluate(() => (window.name = ""));
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f6f3ec;color:#1a1915;font-family:Georgia,'Times New Roman',serif">
    <div style="font:600 13px system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#c8401a;margin-bottom:18px">Shortlisted</div>
    <h1 style="font-size:50px;font-weight:400;margin:0 0 22px;text-align:center;max-width:1000px">${title}</h1>
    ${lines.map((l) => `<p style="font:400 21px/1.5 system-ui,sans-serif;color:#55524a;margin:4px 0;text-align:center;max-width:880px">${l}</p>`).join("")}
  </body>`);
  await wait(ms);
}

/** Opens the terminal page and replays one or more captured commands. */
async function terminal(who, title, prompt, sessions, captionBefore, captionAfter) {
  await page.goto(TERMINAL);
  await page.evaluate((o) => window.setup(o), { who, title, note: "Real output, replayed. Waits are shortened." });
  if (captionBefore) await say(captionBefore);
  for (const s of sessions) {
    // A long download is squeezed to "fit" milliseconds so the replay does not take minutes.
    const total = s.chunks.at(-1)?.t ?? 0;
    const scale = s.fit && total > s.fit ? s.fit / total : 1;
    const chunks = s.chunks.map((c) => ({ ...c, t: c.t * scale }));
    await page.evaluate((o) => window.play(o), { prompt, command: s.command, chunks, speed: SPEED, maxGap: s.maxGap ?? 700 });
    await wait(900);
  }
  if (captionAfter) await say(captionAfter);
}

/** GitHub shows a sign-up banner and cookie bar to visitors; they are hidden so the page itself is readable. */
async function github(url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: ".js-consent-banner, #ghcc, .signup-prompt, .js-signup-prompt, [data-testid='cookie-consent-banner']{display:none!important}" }).catch(() => {});
  await page.evaluate(() => window.__wtDraw?.());
  await wait(1200);
}

const PROMPT_OWNER = "C:\\Git\\Shortlisted>";
const PROMPT_USER = "C:\\Users\\you\\Documents\\Shortlisted>";

if (phase === "install") {
  await card("How a release reaches a user", ["Part one: you publish a version, and a new user installs it.", "Part two: you publish an update, and the user gets it.", "Everything on screen is real: your GitHub pages, and a real install."], 6500);

  chapter = "1 · You publish version 0.3.0";
  await terminal(
    "You, the owner",
    "Terminal",
    PROMPT_OWNER,
    [log("0-tag-030.json"), log("0-push-030.json")],
    "A release starts with two commands on your computer. The first names this exact version of the code. The second sends that name to GitHub.",
    "That is all you do. The tag v0.3.0 is now on GitHub, and GitHub takes over.",
  );

  await github(`${REPO}/actions/runs/${process.env.RUN_030 ?? ""}`);
  await say("Pushing the tag starts the Release workflow by itself. A green tick means it finished without errors.");
  await say("It does two jobs. One builds the app into a ready-made image for Intel, AMD and Apple computers. The other builds the Chrome extension and zips it.");

  await github(`${REPO}/releases/tag/v0.3.0`);
  await say("The result is a release page. This is the page your users are sent to.");
  const asset = page.getByRole("link", { name: /shortlisted-extension\.zip/ }).first();
  await asset.waitFor({ timeout: 20_000 }).catch(() => {});
  if (await asset.count()) await spot(asset);
  await say("The Chrome extension is attached as a zip file. Users download it from here instead of building it themselves.");

  await github(`${REPO}/pkgs/container/shortlisted`);
  await say("And this is the app image, stored on GitHub. It is public, so anyone's computer can download it without signing in.");

  chapter = "2 · A new user installs it";
  await card("Now the user's side", ["They have Docker Desktop and Chrome.", "They have never seen the code."], 4200);
  await github(REPO);
  await say("The user opens your GitHub page.");
  const code = page.getByRole("button", { name: /^Code$/ }).first();
  if (await code.count()) {
    await spot(code);
    await code.click().catch(() => {});
    await wait(900);
    const zip = page.getByRole("link", { name: /Download ZIP/ }).first();
    if (await zip.count()) await spot(zip);
  }
  await say("They click Code, then Download ZIP, and unzip the folder. No Git needed.");

  await terminal(
    "The user",
    "PowerShell",
    PROMPT_USER,
    [{ ...log("1-setup.json"), maxGap: 500 }],
    "In that folder they run one command, the setup script. Docker Desktop must be open.",
    "The script picked a free port, downloaded the published image, started the database, the app and the worker, and opened the browser. Nothing was built on this computer.",
  );

  await page.goto(`${APP}/setup`);
  await say("This is what opens: the setup checklist of a brand new install. No resume yet, no settings yet.");
  await spot(page.getByRole("heading", { name: "The Chrome extension" }).locator(".."));
  await say("Row four sends the user to the latest release for the extension zip. That link only works because a release exists.");
  await page.goto(`${APP}/settings`);
  await spot(page.getByText(/Version\s*v0\.3\.0/).first());
  await say("At the bottom of Settings, the app knows which version it is: v0.3.0. The release stamped that in.");

  await page.goto(`${APP}/jobs?pool=relocate&q=n8n`);
  await say("The job list is already here, downloaded from the daily feed. 5,815 roles on a brand new install.");
  const role = page.getByRole("link", { name: /Lead Forward Deployed Engineer - EMEA/ }).first();
  await role.click();
  await page.waitForURL(/\/jobs\/c/);
  await spot(page.getByText("Visa sponsorship stated").first());
  await say("Remember this role. In version 0.3.0 the tag says only that visa sponsorship is stated. The posting's own sentence says it is for Germany only.");
  await say("You fix that in the code. Now the fix has to reach this user.", 3800);
}

if (phase === "update1") {
  chapter = "3 · You publish an update, version 0.3.1";
  await card("Part two: an update", ["You fixed the visa tag. The user is still on 0.3.0."], 4200);
  await terminal(
    "You, the owner",
    "Terminal",
    PROMPT_OWNER,
    [log("2-tag-031.json"), log("2-push-031.json")],
    "After the fix is merged, the same two commands again, with the next number.",
    "GitHub builds version 0.3.1 the same way as before.",
  );
  await github(`${REPO}/releases`);
  await say("Both versions are now listed. 0.3.1 is marked Latest, and it has its own extension zip.");

  chapter = "4 · The user updates";
  await page.goto(`${APP}/settings`);
  const notice = page.getByText(/Version v0\.3\.1 is available/).first();
  await notice.waitFor({ timeout: 20_000 });
  await spot(notice.locator(".."));
  await say("On the user's computer, Settings now says a newer version is available, and shows the two commands to get it.");
  await say("The app checks for a new release a few times a day. It sends nothing about the user when it does.", 4200);

}

if (phase === "update2") {
  chapter = "4 · The user updates";
  await terminal(
    "The user",
    "PowerShell",
    PROMPT_USER,
    [
      { ...log("3-pull.json"), maxGap: 450, fit: 13000 },
      { ...log("3-up.json"), maxGap: 450 },
    ],
    "The user runs them in the Shortlisted folder. The first downloads the new image. The second restarts the app on it.",
    "Done. Their resume, their applications and their settings are kept. Only the app itself was replaced.",
  );

  await page.goto(`${APP}/settings`);
  await spot(page.getByText(/Version\s*v0\.3\.1/).first());
  await say("Settings now says v0.3.1, and the notice is gone.");

  await page.goto(`${APP}/jobs?pool=relocate&q=n8n`);
  const role = page.getByRole("link", { name: /Lead Forward Deployed Engineer - EMEA/ }).first();
  await role.click();
  await page.waitForURL(/\/jobs\/c/);
  const tag = page.getByText(/Visa sponsorship stated, for Germany only/).first();
  await tag.waitFor({ timeout: 20_000 });
  await spot(tag);
  await say("And the same role now reads: visa sponsorship stated, for Germany only. Your fix has reached the user.");

  await card("The whole loop", ["You: merge the change, push a tag.", "GitHub: builds the image and the extension, makes the release page.", "The user: sees the notice, runs two commands."], 7000);
}

const video = page.video();
await context.close();
await browser.close();
renameSync(await video.path(), path.join(OUT, `release-${phase}.webm`));
console.log(`Written ${path.join(OUT, `release-${phase}.webm`)}`);
