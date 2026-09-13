"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, Copy, Download, Loader2, RefreshCw } from "lucide-react";
import { ReplyBox } from "@/components/reply-box";
import { ACTIVE_STAGES, STAGES, STAGE_LABEL, TERMINAL_STAGES, nextStage, type StageName } from "@shortlisted/core/stages";
import type { ApplicationView } from "@/lib/applications";
import { StageTag, VerdictTag } from "@/components/badges";

/**
 * The detail page. Polls while generation is running, then shows the diff,
 * flags, PDF, cover letter, stage controls, timeline and notes. The extension
 * side panel renders the same JSON with a smaller layout.
 */
export function ApplicationLive({ initial }: { initial: ApplicationView }) {
  const [app, setApp] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [regenNote, setRegenNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [copied, setCopied] = useState(false);
  const generating = app.generationStatus === "QUEUED" || app.generationStatus === "RUNNING";

  useEffect(() => {
    if (!generating) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/applications/${app.id}`, { cache: "no-store" });
      if (res.ok) setApp(await res.json());
    }, 2000);
    return () => clearInterval(t);
  }, [generating, app.id]);

  async function post(path: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch(`/api/applications/${app.id}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) setApp(await res.json());
    } finally {
      setBusy(false);
    }
  }

  async function completeReminder(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/reminders/${id}/done`, { method: "POST" });
      if (res.ok) setApp(await res.json());
    } finally {
      setBusy(false);
    }
  }

  async function copyCover() {
    if (!app.coverLetter) return;
    await navigator.clipboard.writeText(app.coverLetter.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const stage = app.stage as StageName;
  const next = nextStage(stage);
  const openReminder = app.reminders.find((r) => !r.doneAt) ?? null;
  const terminal = TERMINAL_STAGES.includes(stage);
  const activeIndex = ACTIVE_STAGES.indexOf(stage);
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-8">
        <header className="enter">
          <div className="flex flex-wrap items-center gap-4">
            <StageTag stage={stage} />
            <VerdictTag verdict={app.fitVerdict} score={app.fitScore} />
            <span className="num ml-auto text-xs text-ink-3">Captured {fmt(app.createdAt)}</span>
          </div>
          <h1 className="display mt-3 text-[34px]">{app.job.title ?? "Reading posting"}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 text-ink-2">
            {app.job.company && <span>{app.job.company}</span>}
            {app.job.url && (
              <a href={app.job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[13px] text-ink-2 underline decoration-hair-strong underline-offset-4 hover:text-ink">
                {app.job.sourceHost ?? "posting"} <ArrowUpRight size={13} strokeWidth={1.75} />
              </a>
            )}
          </p>
        </header>

        {openReminder && (
          <div className="callout callout-warn enter items-center" style={{ "--i": 1 } as React.CSSProperties}>
            <span className="flex-1">Ten days in Applied with no change. Time to follow up.</span>
            <button className="btn btn-sm" disabled={busy} onClick={() => completeReminder(openReminder.id)}>
              <Check size={13} strokeWidth={2} /> Done
            </button>
          </div>
        )}

        {app.needsReply && (
          <div className="enter" style={{ "--i": 1 } as React.CSSProperties}>
            <ReplyBox applicationId={app.id} onDone={setApp} />
          </div>
        )}

        {generating && (
          <div className="card enter" style={{ "--i": 1 } as React.CSSProperties}>
            <div className="flex items-center gap-2.5 text-[13px]">
              <span className="pulse" />
              <span className="font-medium">Generating</span>
              <span className="text-ink-2">Scoring the fit, validating the selection, rendering the PDF.</span>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <div className="skeleton h-3 w-3/4" />
              <div className="skeleton h-3 w-1/2" />
              <div className="skeleton h-3 w-2/3" />
            </div>
          </div>
        )}
        {app.generationStatus === "FAILED" && (
          <div className="callout callout-bad enter" style={{ "--i": 1 } as React.CSSProperties}>
            <span>{app.generationError}</span>
          </div>
        )}
        {(app.generationStatus === "SKIPPED" || (app.generationStatus === "DONE" && app.generationError)) && (
          <div className="callout callout-warn enter" style={{ "--i": 1 } as React.CSSProperties}>
            <span>{app.generationError}</span>
          </div>
        )}

        {app.gaps.length > 0 && (
          <section className="enter" style={{ "--i": 2 } as React.CSSProperties}>
            <h2 className="label">Gaps the bank does not cover</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {app.gaps.map((g) => (
                <span key={g} className="chip">
                  {g}
                </span>
              ))}
            </div>
          </section>
        )}

        {app.resume?.diff && (
          <section className="enter" style={{ "--i": 3 } as React.CSSProperties}>
            <h2 className="label">What changed versus your base resume</h2>
            <DiffView diff={app.resume.diff} />
          </section>
        )}

        {app.resume && app.resume.flags.length > 0 && (
          <section className="callout callout-warn enter flex-col !items-stretch" style={{ "--i": 4 } as React.CSSProperties}>
            <div className="font-medium">Flagged by validation</div>
            <p className="text-xs text-ink-2">Read these before you send. Each one is a place where the rewording drifted from the bank.</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {app.resume.flags.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className="num shrink-0 text-[11px] text-ink-3">{f.kind}</span>
                  <span>{f.detail}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {app.resume?.hasFile && (
          <section className="enter" style={{ "--i": 5 } as React.CSSProperties}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="label">
                Resume <span className="text-ink-3">v{app.resume.version}</span>
              </h2>
              <a className="btn btn-sm" href={`/api/documents/${app.resume.id}/file`}>
                <Download size={13} strokeWidth={1.75} /> {app.resume.fileName}
              </a>
            </div>
            <iframe title="Resume preview" src={`/api/documents/${app.resume.id}/file?inline=1`} className="h-[760px] w-full rounded-[var(--radius)] border border-hair bg-white" />
          </section>
        )}

        {app.coverLetter && (
          <section className="enter" style={{ "--i": 6 } as React.CSSProperties}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="label">Cover letter</h2>
              <div className="flex gap-1.5">
                <button className="btn btn-sm" onClick={copyCover} aria-live="polite">
                  {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.75} />} {copied ? "Copied" : "Copy"}
                </button>
                {app.coverLetter.hasFile && (
                  <a className="btn btn-sm" href={`/api/documents/${app.coverLetter.id}/file`}>
                    <Download size={13} strokeWidth={1.75} /> PDF
                  </a>
                )}
              </div>
            </div>
            <p className="card whitespace-pre-wrap text-[14px] leading-relaxed">{app.coverLetter.text}</p>
          </section>
        )}

        {!generating && !app.needsReply && app.generationStatus !== "SKIPPED" && (
          <section className="enter border-t border-hair pt-6" style={{ "--i": 7 } as React.CSSProperties}>
            <h2 className="label">Regenerate</h2>
            <p className="hint">Same posting, a fresh selection. Add an instruction if you want it steered.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input className="field" placeholder="e.g. lead with the ledger work" value={regenNote} onChange={(e) => setRegenNote(e.target.value)} aria-label="Regenerate instruction" />
              <button className="btn shrink-0" disabled={busy} onClick={() => post("/regenerate", { note: regenNote || null })}>
                {busy ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} strokeWidth={1.75} />} Regenerate
              </button>
            </div>
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-8 lg:border-l lg:border-hair lg:pl-8">
        <section className="enter" style={{ "--i": 2 } as React.CSSProperties}>
          <h2 className="label">Stage</h2>
          <ol className="mt-3 flex flex-col">
            {ACTIVE_STAGES.map((s, i) => {
              const done = !terminal && i < activeIndex;
              const current = s === stage;
              return (
                <li key={s} className={`step ${done ? "step-done" : ""} ${current ? "step-current" : ""}`}>
                  <span className="step-mark">{done ? <Check size={10} strokeWidth={3} /> : i + 1}</span>
                  {STAGE_LABEL[s]}
                </li>
              );
            })}
          </ol>
          {terminal && (
            <p className="mt-2 text-[13px]">
              <StageTag stage={stage} />
              {app.rejectionReason && <span className="ml-2 text-ink-2">{app.rejectionReason}</span>}
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2">
            {next && (
              <button className="btn btn-primary" disabled={busy} onClick={() => post("/stage", { stage: next })}>
                Mark {STAGE_LABEL[next]} <ArrowRight size={14} strokeWidth={2} />
              </button>
            )}
            <select className="field" value={app.stage} disabled={busy} onChange={(e) => post("/stage", { stage: e.target.value })} aria-label="Set stage">
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
            {!terminal && !rejecting && (
              <div className="flex gap-1">
                <button className="btn btn-ghost btn-sm btn-danger flex-1" disabled={busy} onClick={() => setRejecting(true)}>
                  Rejected
                </button>
                <button className="btn btn-ghost btn-sm flex-1" disabled={busy} onClick={() => post("/stage", { stage: "WITHDRAWN" })}>
                  Withdraw
                </button>
              </div>
            )}
            {rejecting && (
              <div className="enter card !p-3">
                <label className="field-label text-xs">Reason, if you know it</label>
                <input className="field" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Optional" autoFocus />
                <div className="mt-2 flex gap-1.5">
                  <button
                    className="btn btn-sm flex-1"
                    disabled={busy}
                    onClick={async () => {
                      await post("/stage", { stage: "REJECTED", note: rejectReason.trim() || null });
                      setRejecting(false);
                    }}
                  >
                    Mark rejected
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setRejecting(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="enter" style={{ "--i": 3 } as React.CSSProperties}>
          <h2 className="label">Timeline</h2>
          <ol className="timeline mt-3 flex flex-col gap-3 text-[13px]">
            {app.events.map((e) => (
              <li key={e.id} className="relative">
                <span className="timeline-dot" style={{ background: `var(--stage-${e.toStage.toLowerCase()})` }} />
                <div className="flex justify-between gap-2">
                  <span>{STAGE_LABEL[e.toStage]}</span>
                  <span className="num shrink-0 text-xs text-ink-3">{fmt(e.createdAt)}</span>
                </div>
                {e.note && <div className="text-xs text-ink-2">{e.note}</div>}
              </li>
            ))}
          </ol>
        </section>

        <section className="enter" style={{ "--i": 4 } as React.CSSProperties}>
          <h2 className="label">Notes</h2>
          <div className="mt-3 flex gap-1.5">
            <input className="field" placeholder="Recruiter, salary, anything" value={note} onChange={(e) => setNote(e.target.value)} aria-label="New note" />
            <button
              className="btn shrink-0"
              disabled={busy || !note.trim()}
              onClick={async () => {
                await post("/notes", { body: note });
                setNote("");
              }}
            >
              Add
            </button>
          </div>
          {app.notes.length === 0 ? (
            <p className="hint">Nothing yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-hair text-[13px]">
              {app.notes.map((n) => (
                <li key={n.id} className="py-2.5">
                  <div className="num text-[11px] text-ink-3">{new Date(n.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</div>
                  <div className="mt-0.5 whitespace-pre-wrap">{n.body}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function DiffView({ diff }: { diff: NonNullable<NonNullable<ApplicationView["resume"]>["diff"]> }) {
  const nothing = diff.headline.from === diff.headline.to && diff.summary.from === diff.summary.to && !diff.addedBullets.length && !diff.removedBullets.length && !diff.reworded.length;
  return (
    <div className="mt-3 flex flex-col gap-5 text-[13px]">
      {nothing && <p className="text-ink-2">Identical to your base resume apart from ordering.</p>}
      {diff.headline.from !== diff.headline.to && (
        <Change label="Headline">
          <div className="diff-del">{diff.headline.from}</div>
          <div className="diff-add">{diff.headline.to}</div>
        </Change>
      )}
      {diff.summary.from !== diff.summary.to && (
        <Change label="Summary">
          <div className="diff-del">{diff.summary.from}</div>
          <div className="diff-add">{diff.summary.to}</div>
        </Change>
      )}
      {diff.addedBullets.length > 0 && (
        <Change label="Added from the bank">
          <ul className="flex flex-col gap-1">
            {diff.addedBullets.map((b) => (
              <li key={b.id} className="flex gap-2">
                <span className="num text-good">+</span>
                <span>{b.text}</span>
              </li>
            ))}
          </ul>
        </Change>
      )}
      {diff.removedBullets.length > 0 && (
        <Change label="Left out">
          <ul className="flex flex-col gap-1 text-ink-2">
            {diff.removedBullets.map((b) => (
              <li key={b.id} className="flex gap-2">
                <span className="num">−</span>
                <span>{b.text}</span>
              </li>
            ))}
          </ul>
        </Change>
      )}
      {diff.reworded.length > 0 && (
        <Change label="Reworded">
          <ul className="flex flex-col gap-2.5">
            {diff.reworded.map((r) => (
              <li key={r.id}>
                <div className="diff-del">{r.from}</div>
                <div>{r.to}</div>
              </li>
            ))}
          </ul>
        </Change>
      )}
      <div className="text-xs text-ink-3">{diff.reorderedCount} bullets moved position.</div>
    </div>
  );
}

function Change({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="diff-block">
      <div className="label mb-1.5">{label}</div>
      {children}
    </div>
  );
}
