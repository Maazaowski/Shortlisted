"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { generateFromPasteAction, type GenerateState } from "@/app/actions/generate";

export function PasteForm() {
  const [state, action, pending] = useActionState<GenerateState, FormData>(generateFromPasteAction, null);
  const [text, setText] = useState("");
  const enough = text.trim().length >= 80;
  return (
    <form action={action} className="enter mt-8 flex flex-col gap-4" style={{ "--i": 1 } as React.CSSProperties}>
      <label>
        <span className="field-label">Posting URL</span>
        <input name="url" type="url" className="field" placeholder="https://" />
        <span className="hint">Optional. Used to recognise the page when you open it again.</span>
      </label>
      <label>
        <span className="field-label">Posting text</span>
        <textarea name="text" rows={14} className="field font-mono text-xs leading-relaxed" required value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the whole posting, requirements included." />
        <span className={`hint num ${text && !enough ? "text-warn" : ""}`}>
          {text.trim().length} characters{text && !enough ? ", paste a bit more" : ""}
        </span>
      </label>
      {state?.error && (
        <p className="callout callout-bad" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary self-start" disabled={pending || !enough}>
        {pending && <Loader2 size={14} className="spin" />} {pending ? "Saving" : "Tailor"}
      </button>
    </form>
  );
}
