import { api, DEFAULT_API_BASE, loadSettings, saveSettings, type Settings } from "./api";
import { attachFiles, extractPage, type AttachResult } from "./page-scripts";
import { STAGES, STAGE_LABEL, VERDICT_LABEL, type ApplicationView, type Capture, type Stage } from "./types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let settings: Settings;
let current: ApplicationView | null = null;
let pollTimer: number | null = null;

// ---------------------------------------------------------------------------
// Setup and settings
// ---------------------------------------------------------------------------

async function init() {
  settings = await loadSettings();
  ($("api-base") as HTMLInputElement).value = settings.apiBase;

  $("settings-toggle").addEventListener("click", () => {
    $("settings").hidden = !$("settings").hidden;
  });
  $("save-settings").addEventListener("click", async () => {
    const apiBase = ($("api-base") as HTMLInputElement).value.trim().replace(/\/$/, "") || DEFAULT_API_BASE;
    await saveSettings({ apiBase });
    settings = await loadSettings();
    $("settings").hidden = true;
    await refreshConnection();
  });
  $("capture").addEventListener("click", capture);

  chrome.storage.onChanged.addListener(async () => {
    settings = await loadSettings();
    await refreshConnection();
  });
  chrome.tabs.onActivated.addListener(() => void showCurrentTab());
  chrome.tabs.onUpdated.addListener((_id, info) => {
    if (info.status === "complete") void showCurrentTab();
  });

  await refreshConnection();
}

/** Three states: the web app is unreachable, it is up but has no bank yet, or it is ready. */
async function refreshConnection() {
  const show = (message: string, link: string) => {
    $("not-connected-message").textContent = message;
    $("open-app").setAttribute("href", link);
    $("not-connected").hidden = false;
    $("ready").hidden = true;
  };
  try {
    const health = await api.me(settings);
    if (!health.hasProfile) {
      show("Import your resume first, then come back here.", `${settings.apiBase}/onboarding`);
      return;
    }
    $("not-connected").hidden = true;
    $("ready").hidden = false;
    await showCurrentTab();
  } catch {
    show(`Cannot reach ${settings.apiBase}. Is the web app running? Change the address under Settings if it moved.`, settings.apiBase);
  }
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** On tab change, show an existing result for this URL if there is one. */
async function showCurrentTab() {
  const tab = await activeTab();
  $("tab-title").textContent = tab?.title ?? "";
  stopPolling();
  if (!tab?.url || !/^https?:/.test(tab.url)) {
    current = null;
    render();
    return;
  }
  try {
    current = await api.findByUrl(settings, tab.url);
  } catch {
    current = null;
  }
  render();
  if (current && isGenerating(current)) startPolling(current.id);
}

// ---------------------------------------------------------------------------
// Capture and polling
// ---------------------------------------------------------------------------

async function capture() {
  const btn = $("capture") as HTMLButtonElement;
  const tab = await activeTab();
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
    status("Open a job page first.", true);
    return;
  }
  btn.disabled = true;
  status("Reading this page");
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPage });
    const cap = res?.result as Capture | undefined;
    if (!cap) throw new Error("Could not read the page.");
    const { id, existing } = await api.capture(settings, cap);
    status(existing ? "Already tailored. Showing the existing result." : "Saved.");
    current = await api.get(settings, id);
    render();
    if (isGenerating(current)) startPolling(id);
  } catch (err) {
    status((err as Error).message, true);
  } finally {
    btn.disabled = false;
  }
}

function isGenerating(a: ApplicationView) {
  return a.generationStatus === "QUEUED" || a.generationStatus === "RUNNING";
}

function startPolling(id: string) {
  stopPolling();
  pollTimer = window.setInterval(async () => {
    try {
      current = await api.get(settings, id);
      render();
      if (!isGenerating(current)) stopPolling();
    } catch {
      stopPolling();
    }
  }, 2000);
}

function stopPolling() {
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = null;
}

function status(msg: string, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.className = isError ? "small err" : "small muted";
}

// ---------------------------------------------------------------------------
// Actions on a result
// ---------------------------------------------------------------------------

async function attach() {
  if (!current?.resume?.hasFile) return;
  const tab = await activeTab();
  if (!tab?.id) return;
  status("Attaching");
  try {
    const b64 = await api.fileBase64(settings, current.resume.id);
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: attachFiles,
      args: [b64, current.resume.fileName, current.coverLetter?.text ?? null],
    });
    const merged = results.reduce<AttachResult>(
      (acc, r) => {
        const v = r.result as AttachResult | undefined;
        if (!v) return acc;
        return { attached: acc.attached || v.attached, coverFilled: acc.coverFilled || v.coverFilled, inputs: acc.inputs + v.inputs };
      },
      { attached: false, coverFilled: false, inputs: 0 },
    );
    if (merged.attached) status(merged.coverFilled ? "Resume attached and cover letter filled." : "Resume attached.");
    else status(merged.inputs === 0 ? "No file input on this page yet. Open the application form, then press Attach." : "Could not attach. Use the file dialog.", true);
  } catch (err) {
    status((err as Error).message, true);
  }
}

async function setStage(stage: Stage) {
  if (!current) return;
  let note: string | null = null;
  if (stage === "REJECTED") note = window.prompt("Reason, if you know it") ?? null;
  current = await api.stage(settings, current.id, stage, note);
  render();
}

async function regenerate() {
  if (!current) return;
  const note = window.prompt("Anything to change? Leave blank to just retry.") ?? "";
  current = await api.regenerate(settings, current.id, note.trim() || null);
  render();
  startPolling(current.id);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function verdictPill(a: ApplicationView) {
  if (!a.fitVerdict) return `<span class="pill muted">Scoring</span>`;
  const cls = a.fitVerdict === "POOR" ? "bad" : a.fitVerdict === "POSSIBLE" ? "warn" : "good";
  return `<span class="pill ${cls}">${VERDICT_LABEL[a.fitVerdict]}${a.fitScore != null ? ` · ${a.fitScore}` : ""}</span>`;
}

function render() {
  const box = $("result");
  if (!current) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const a = current;
  const parts: string[] = [];

  parts.push(`<div class="box">
    <div class="row">${verdictPill(a)} <span class="pill accent">${STAGE_LABEL[a.stage]}</span>${a.reminders.some((r) => !r.doneAt) ? ` <span class="pill warn">Follow up</span>` : ""}</div>
    <h3>${esc(a.job.title ?? "Reading posting")}</h3>
    <div class="muted small">${esc(a.job.company ?? "")}</div>
    ${a.gaps.length ? `<h2>Gaps</h2><div class="small">${esc(a.gaps.join(", "))}</div>` : ""}
  </div>`);

  if (a.needsReply) {
    parts.push(`<div class="box">
      <h2>Your turn</h2>
      <div class="small muted">Copy the prompt, paste it into Claude, then paste the JSON reply here.</div>
      <div class="row" style="margin-top:8px"><button id="copy-prompt" class="primary">Copy prompt</button><a class="link" href="https://claude.ai/new" target="_blank">Open Claude</a></div>
      <textarea id="reply-text" rows="6" placeholder="Paste the reply here" style="margin-top:8px"></textarea>
      <div class="row" style="margin-top:6px"><button id="submit-reply">Submit reply</button><span id="reply-status" class="small muted"></span></div>
    </div>`);
  }
  if (isGenerating(a))
    parts.push(
      `<div class="box"><div class="gen"><span class="pulse-dot"></span><div><strong>Generating</strong><div class="small muted">Scoring, validating, rendering.</div></div></div><div class="skeleton" style="width:80%"></div><div class="skeleton" style="width:55%"></div></div>`,
    );
  if (a.generationStatus === "FAILED") parts.push(`<div class="box badbox small">${esc(a.generationError ?? "Failed")}</div>`);
  if (a.generationStatus === "SKIPPED") parts.push(`<div class="box warnbox small">${esc(a.generationError ?? "Skipped")}</div>`);
  if (a.generationStatus === "DONE" && a.generationError) parts.push(`<div class="box warnbox small">${esc(a.generationError)}</div>`);

  const d = a.resume?.diff;
  if (d) {
    const rows: string[] = [];
    if (d.headline.from !== d.headline.to) rows.push(`<div><span class="del">${esc(d.headline.from)}</span><br><span class="add">${esc(d.headline.to)}</span></div>`);
    if (d.addedBullets.length) rows.push(`<h2>Added</h2><ul class="add">${d.addedBullets.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul>`);
    if (d.removedBullets.length) rows.push(`<h2>Left out</h2><ul class="del">${d.removedBullets.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul>`);
    if (d.reworded.length) rows.push(`<h2>Reworded</h2><ul>${d.reworded.map((r) => `<li><span class="del">${esc(r.from)}</span><br>${esc(r.to)}</li>`).join("")}</ul>`);
    rows.push(`<div class="muted small">${d.reorderedCount} bullets moved.</div>`);
    parts.push(`<div class="box"><h2>What changed</h2>${rows.join("")}</div>`);
  }

  if (a.resume?.flags.length) {
    parts.push(`<div class="box warnbox"><h2>Flagged</h2><ul class="small">${a.resume.flags.map((f) => `<li>${esc(f.detail)}</li>`).join("")}</ul></div>`);
  }

  if (a.generationStatus === "DONE" || a.generationStatus === "FAILED" || a.generationStatus === "SKIPPED") {
    parts.push(`<div class="box">
      <div class="row">
        <button id="attach" class="primary" ${a.resume?.hasFile ? "" : "disabled"}>Attach</button>
        <button id="regen">Regenerate</button>
        ${a.resume?.hasFile ? `<a class="link" href="${settings.apiBase}/api/documents/${a.resume.id}/file?inline=1" target="_blank">Open PDF</a>` : ""}
        <a class="link" href="${settings.apiBase}/applications/${a.id}" target="_blank">Details</a>
      </div>
      ${a.resume ? `<div class="muted small" style="margin-top:6px">${esc(a.resume.fileName)}</div>` : ""}
    </div>`);
  }

  if (a.coverLetter) {
    parts.push(`<div class="box"><h2>Cover letter</h2><div class="cover">${esc(a.coverLetter.text)}</div>
      <div class="row" style="margin-top:6px"><button id="copy-cover">Copy</button></div></div>`);
  }

  parts.push(`<div class="box"><h2>Stage</h2><div class="stages">${STAGES.map(
    (s) => `<button data-stage="${s}" class="${s === a.stage ? "current" : ""}">${STAGE_LABEL[s]}</button>`,
  ).join("")}</div></div>`);

  box.innerHTML = parts.join("");
  box.hidden = false;

  box.querySelector("#copy-prompt")?.addEventListener("click", async () => {
    const btn = box.querySelector("#copy-prompt") as HTMLButtonElement;
    btn.disabled = true;
    try {
      await navigator.clipboard.writeText(await api.prompt(settings, a.id));
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy prompt"), 1500);
    } catch (err) {
      status((err as Error).message, true);
    } finally {
      btn.disabled = false;
    }
  });
  box.querySelector("#submit-reply")?.addEventListener("click", async () => {
    const text = (box.querySelector("#reply-text") as HTMLTextAreaElement).value;
    const out = box.querySelector("#reply-status")!;
    out.className = "small muted";
    out.textContent = "Checking";
    try {
      current = await api.reply(settings, a.id, text);
      render();
      startPolling(a.id);
    } catch (err) {
      out.className = "small err";
      out.textContent = (err as Error).message;
    }
  });
  box.querySelector("#attach")?.addEventListener("click", attach);
  box.querySelector("#regen")?.addEventListener("click", regenerate);
  box.querySelector("#copy-cover")?.addEventListener("click", () => navigator.clipboard.writeText(a.coverLetter?.text ?? ""));
  box.querySelectorAll<HTMLButtonElement>("[data-stage]").forEach((b) => b.addEventListener("click", () => setStage(b.dataset.stage as Stage)));
}

init().catch((err) => status((err as Error).message, true));
