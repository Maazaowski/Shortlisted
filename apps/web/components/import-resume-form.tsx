"use client";

import { useActionState, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, FileText, Loader2 } from "lucide-react";
import { importReplyAction, importResumeAction, type ImportState } from "@/app/actions/onboarding";

export function ImportResumeForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importResumeAction, null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function take(f: File | undefined) {
    if (!f) return;
    setFile(f);
    if (input.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      input.current.files = dt.files;
    }
  }

  if (state?.prompt) return <ImportReplyForm prompt={state.prompt} fileName={file?.name ?? "your resume"} />;

  return (
    <form action={action} className="enter mt-8 flex flex-col gap-3" style={{ "--i": 2 } as React.CSSProperties}>
      <div
        className="dropzone flex cursor-pointer items-center gap-4 px-5 py-6"
        data-active={over}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files[0]);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        aria-label="Choose your resume, PDF or Word"
      >
        <input ref={input} name="resume" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required className="sr-only" tabIndex={-1} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <FileText size={22} strokeWidth={1.5} className="shrink-0 text-ink-3" />
        {file ? (
          <div className="min-w-0">
            <div className="truncate font-medium">{file.name}</div>
            <div className="num text-xs text-ink-2">{(file.size / 1024).toFixed(0)} KB · click to choose another</div>
          </div>
        ) : (
          <div>
            <div className="font-medium">Drop your resume here, or click to browse</div>
            <div className="text-xs text-ink-2">PDF or Word (.docx), up to 5 MB.</div>
          </div>
        )}
      </div>
      {state?.error && (
        <p className="callout callout-bad" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary self-start" disabled={pending || !file}>
        {pending ? (
          <>
            <Loader2 size={14} className="spin" /> Reading your resume
          </>
        ) : (
          "Import and build my bank"
        )}
      </button>
    </form>
  );
}

/** Manual provider: the resume text became a prompt; the user brings back the JSON. */
function ImportReplyForm({ prompt, fileName }: { prompt: string; fileName: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importReplyAction, null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <form action={action} className="enter mt-8 flex flex-col gap-4">
      <input type="hidden" name="prompt" value={prompt} />
      <div className="callout callout-accent">
        <span>
          Read <span className="font-medium">{fileName}</span>. No API key is set, so the model runs through you: copy the prompt, paste it into Claude, and paste the reply back here.
        </span>
      </div>
      <ol className="flex flex-col gap-4">
        <li className="flex flex-wrap items-center gap-2">
          <span className="num w-5 text-xs text-ink-3">01</span>
          <button type="button" className="btn btn-primary" onClick={copy}>
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
          <textarea name="reply" className="field font-mono text-xs leading-relaxed" rows={9} required placeholder="The JSON reply, with or without the code fence." aria-label="Pasted reply" />
          {state?.error && (
            <p className="callout callout-bad" role="alert">
              {state.error}
            </p>
          )}
          <button className="btn self-start" disabled={pending}>
            {pending ? <Loader2 size={14} className="spin" /> : null} Build my bank
          </button>
        </li>
      </ol>
    </form>
  );
}
