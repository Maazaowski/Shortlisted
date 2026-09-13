"use client";

import { useState } from "react";
import { ArrowUpRight, Check, Copy, Loader2 } from "lucide-react";
import type { ApplicationView } from "@/lib/applications";

/**
 * Manual provider. Step one copies the prompt for this application; the user
 * pastes it into Claude. Step two takes the JSON reply back and queues the
 * rest of the pipeline. The same box serves capture and Regenerate.
 */
export function ReplyBox({ applicationId, onDone }: { applicationId: string; onDone: (view: ApplicationView) => void }) {
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyPrompt() {
    setError(null);
    const res = await fetch(`/api/applications/${applicationId}/prompt`, { cache: "no-store" });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not build the prompt.");
      return;
    }
    await navigator.clipboard.writeText(await res.text());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError((body as { error?: string }).error ?? "Could not read the reply.");
        return;
      }
      setText("");
      onDone(body as ApplicationView);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="label">Your turn</h2>
      <p className="mt-1 text-[13px] text-ink-2">
        No API key is set, so the model runs through you. Copy the prompt, paste it into Claude, then paste the reply below. About a minute.
      </p>
      <ol className="mt-4 flex flex-col gap-4">
        <li className="flex flex-wrap items-center gap-2">
          <span className="num w-5 text-xs text-ink-3">01</span>
          <button className="btn btn-primary" onClick={copyPrompt}>
            {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.75} />} {copied ? "Copied" : "Copy prompt"}
          </button>
          <a href="https://claude.ai/new" target="_blank" rel="noreferrer" className="btn">
            Open Claude <ArrowUpRight size={13} strokeWidth={1.75} />
          </a>
        </li>
        <li className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="num w-5 text-xs text-ink-3">02</span>
            <span className="text-[13px] font-medium">Paste the reply</span>
          </div>
          <textarea
            className="field font-mono text-xs leading-relaxed"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="The JSON reply, with or without the code fence."
            aria-label="Pasted reply"
          />
          {error && (
            <p className="callout callout-bad" role="alert">
              {error}
            </p>
          )}
          <button className="btn self-start" disabled={busy || text.trim().length < 2} onClick={submit}>
            {busy ? <Loader2 size={14} className="spin" /> : null} Submit reply
          </button>
        </li>
      </ol>
    </section>
  );
}
