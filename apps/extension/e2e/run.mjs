// End-to-end test of the unpacked extension in a throwaway Chrome for Testing, driven over the
// DevTools protocol against a running web app in manual mode. Run: pnpm --filter @shortlisted/extension e2e
// The side panel page runs as a background tab in the same window as the job
// page, so chrome.tabs.query({active, currentWindow}) resolves to the job page
// exactly as it does inside the real side panel.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_BIN;
if (!CHROME) throw new Error("Set CHROME_BIN to a Chrome for Testing binary (npx @puppeteer/browsers install chrome@stable). Branded Chrome ignores --load-extension.");
const EXT = path.resolve(HERE, "..", "dist");
const API = (process.env.API_BASE || "http://localhost:3010").replace(/\/$/, "");
const OUT = path.join(HERE, "out");
mkdirSync(OUT, { recursive: true });
const PORT = 9333;
const headless = !process.argv.includes("--headed");

// The fixture posting is served locally so the test needs nothing but the app.
// A run token goes into the posting text as well as the URL, so dedupe by content hash never
// matches an application from an earlier run.
const run = Date.now().toString(36);
const fixture = readFileSync(path.join(HERE, "fixtures", "ledgerly.html"), "utf8").replaceAll("RUN_TOKEN", run);
const fixtureServer = createServer((_req, res) => { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(fixture); });
await new Promise((r) => fixtureServer.listen(0, "127.0.0.1", r));
const JOB_URL = `http://127.0.0.1:${fixtureServer.address().port}/jobs/ledgerly-${run}`;

const profile = mkdtempSync(path.join(tmpdir(), "sl-ext-"));
const chrome = spawn(CHROME, [
  ...(headless ? ["--headless=new"] : []),
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${PORT}`,
  `--load-extension=${EXT}`,
  `--disable-extensions-except=${EXT}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--window-size=1200,900",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function listTargets() {
  return (await fetch(`http://localhost:${PORT}/json/list`)).json();
}
for (let i = 0; i < 120; i++) { try { await listTargets(); break; } catch { await sleep(250); } }

// One CDP session per target.
class Session {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.events = [];
    this.ready = new Promise((res) => (this.ws.onopen = res));
    this.ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && this.pending.has(msg.id)) { const { res, rej } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); } else this.events.push(msg); };
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
  async eval(expr) { const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval failed"); return r.result.value; }
  async shot(file) { const r = await this.send("Page.captureScreenshot", { format: "png" }); writeFileSync(file, Buffer.from(r.data, "base64")); }
  close() { this.ws.close(); }
}
async function attach(target) { const s = new Session(target.webSocketDebuggerUrl); await s.ready; await s.send("Runtime.enable"); await s.send("Page.enable"); return s; }

const log = (...a) => console.log("[ext-test]", ...a);
let extId = null;
for (let i = 0; i < 40 && !extId; i++) {
  for (const t of (await listTargets()).filter((x) => x.type === "service_worker" && x.url.startsWith("chrome-extension://"))) {
    const sw = new Session(t.webSocketDebuggerUrl); await sw.ready; await sw.send("Runtime.enable");
    const name = await sw.eval("chrome.runtime.getManifest().name").catch(() => null);
    sw.close();
    if (name === "Shortlisted") { extId = new URL(t.url).host; break; }
  }
  if (!extId) await sleep(250);
}
if (!extId) { const all = await listTargets(); throw new Error("extension not found in targets: " + JSON.stringify(all.map((t) => [t.type, t.url]))); }
log("extension id", extId);

// Browser-level session for target management; a page session cannot open extension URLs.
const version = await (await fetch(`http://localhost:${PORT}/json/version`)).json();
const browser = new Session(version.webSocketDebuggerUrl); await browser.ready;
// Job page first (active), then the panel page in the background of the same window.
const { targetId: jobId } = await browser.send("Target.createTarget", { url: JOB_URL });
await sleep(800);
const { targetId: panelId } = await browser.send("Target.createTarget", { url: "about:blank", background: true });
await sleep(300);
await browser.send("Target.activateTarget", { targetId: jobId });
let targets = await listTargets();
const panel = await attach(targets.find((t) => t.id === panelId));
const job = await attach(targets.find((t) => t.id === jobId));
// Screenshots at the side panel's real width.
await panel.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 900, deviceScaleFactor: 2, mobile: false });
const nav = await panel.send("Page.navigate", { url: `chrome-extension://${extId}/sidepanel.html` });
log("navigate result:", JSON.stringify(nav));
await sleep(1200);
log("panel href:", await panel.eval("location.href"), "| storage api:", await panel.eval("typeof chrome?.storage?.local"));
// Screenshots: no mount animations mid-frame, and an optional forced colour scheme (PANEL_SCHEME=light|dark).
const scheme = process.env.PANEL_SCHEME;
const stillStyle = `*{animation:none!important;transition:none!important}${scheme ? `:root{color-scheme:${scheme}!important}` : ""}`;
const still = () => panel.eval(`(() => { let s = document.getElementById("e2e-still"); if (!s) { s = document.createElement("style"); s.id = "e2e-still"; document.head.appendChild(s); } s.textContent = ${JSON.stringify(stillStyle)}; return true; })()`);

// Point the panel at the dev server and reload it so init() reads the setting.
await panel.eval(`chrome.storage.local.set({ apiBase: ${JSON.stringify(API)} })`);
await panel.send("Page.reload");
await sleep(1500);
await still();

const text = async () => (await panel.eval(`document.body.innerText`)).replace(/\n+/g, " | ");
const visible = async (sel) => panel.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return !!el && !el.closest("[hidden]"); })()`);
log("panel after load:", await text());
if (!(await visible("#ready"))) throw new Error("panel is not in the ready state");
log("tab title seen by panel:", await panel.eval(`document.getElementById("tab-title").textContent`));
await still(); await sleep(300); await panel.shot(path.join(OUT, "ext-1-ready.png"));

// Capture.
await panel.eval(`document.getElementById("capture").click()`);
let state = "";
for (let i = 0; i < 30; i++) { await sleep(500); state = await text(); if (/Your turn|Already tailored|Generating/i.test(state)) break; }
log("after capture:", state);
if (!/Your turn/i.test(state)) throw new Error("expected the waiting state");
await still(); await sleep(300); await panel.shot(path.join(OUT, "ext-2-waiting.png"));
const found = await (await fetch(`${API}/api/applications?url=${encodeURIComponent(JOB_URL)}`)).json();
log("application by url:", found?.id, found?.generationStatus);
const appId = `/applications/${found.id}`;

// Copy prompt (clipboard may be denied in a background tab; the API call is what matters).
const copyResult = await panel.eval(`(async () => { document.getElementById("copy-prompt").click(); await new Promise(r => setTimeout(r, 800)); return document.getElementById("copy-prompt").textContent; })()`);
log("copy button after click:", copyResult, "| status:", await panel.eval(`document.getElementById("status").textContent`));
const id = appId.split("/applications/")[1];
const prompt = await (await fetch(`${API}/api/applications/${id}/prompt`)).text();
log("prompt length", prompt.length, "has aliases:", /### e1:/.test(prompt) && /- b1:/.test(prompt));

// Paste the reply and submit.
const reply = readFileSync(path.join(HERE, "fixtures", "reply.json"), "utf8");
await panel.eval(`document.getElementById("reply-text").value = ${JSON.stringify(reply)}`);
await panel.eval(`document.getElementById("submit-reply").click()`);
for (let i = 0; i < 60; i++) { await sleep(1000); state = await text(); if (/Attach/.test(state) && !/Generating/.test(state)) break; }
log("after reply:", state.slice(0, 400));
const attachEnabled = await panel.eval(`!document.getElementById("attach")?.disabled`);
log("attach enabled:", attachEnabled);
await still(); await sleep(300); await panel.shot(path.join(OUT, "ext-3-result.png"));
if (!attachEnabled) throw new Error("Attach is not enabled; generation did not finish");

// Attach into the job page's form.
await panel.eval(`document.getElementById("attach").click()`);
for (let i = 0; i < 20; i++) { await sleep(500); const s = await panel.eval(`document.getElementById("status").textContent`); if (/attached|Could not|No file input/.test(s)) { log("attach status:", s); break; } }
const form = await job.eval(`({ file: document.getElementById("resume").files[0]?.name ?? null, size: document.getElementById("resume").files[0]?.size ?? 0, cover: document.getElementById("cover").value.slice(0, 60) })`);
log("job page form:", JSON.stringify(form));
await job.shot(path.join(OUT, "ext-4-jobpage.png"));

// Stage change from the panel.
await panel.eval(`document.querySelector('[data-stage="APPLIED"]').click()`);
await sleep(1500);
log("stage pill:", await panel.eval(`document.querySelector(".pill.accent")?.textContent`));
const view = await (await fetch(`${API}/api/applications/${id}`)).json();
log("server view:", view.stage, view.generationStatus, "resume file:", view.resume?.hasFile, "flags:", view.resume?.flags?.length);
await still(); await sleep(300); await panel.shot(path.join(OUT, "ext-5-applied.png"));

panel.close(); job.close(); browser.close();
chrome.kill();
fixtureServer.close();
log("done");
process.exit(0);
