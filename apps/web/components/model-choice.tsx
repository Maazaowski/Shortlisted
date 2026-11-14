"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { chooseModelAction, finishSignInAction, signInStatusAction, signOutAction, startSignInAction, type SignInView } from "@/app/actions/setup";
import { TestModelButton } from "./test-model-button";

export type ModelChoiceProps = {
  current: "manual" | "claude-cli" | "codex-cli" | "anthropic";
  /** The chosen tool is present where Shortlisted runs. */
  installed: boolean;
  /** The chosen way is ready to use. */
  ready: boolean;
  /** An API key is set in the .env file, so that option can be offered. */
  hasApiKey: boolean;
};

const OPTIONS = [
  { id: "manual", title: "Copy and paste", detail: "Free, no sign-in. You paste a prompt into Claude or ChatGPT and paste the reply back. About a minute per job." },
  { id: "claude-cli", title: "My Claude plan", detail: "Runs by itself, about twenty seconds per job. Sign in once with your Claude account." },
  { id: "codex-cli", title: "My ChatGPT plan", detail: "Runs by itself, about twenty seconds per job. Sign in once with your ChatGPT account." },
  { id: "anthropic", title: "Anthropic API key", detail: "Runs by itself and is billed per job, using the key in the .env file." },
] as const;

const TOOL = { "claude-cli": "Claude Code", "codex-cli": "Codex" } as const;

/** Picks how the writing is done and, for a Claude or ChatGPT plan, signs in. Everything happens on this page. */
export function ModelChoice({ current, installed, ready, hasApiKey }: ModelChoiceProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [signIn, setSignIn] = useState<SignInView | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cli = current === "claude-cli" || current === "codex-cli";
  const waitingOnCodex = signIn?.kind === "codex-cli" && signIn.state === "waiting";

  // Codex finishes by itself once the code is typed on its page, so the page watches for that.
  useEffect(() => {
    if (!waitingOnCodex) return;
    const t = setInterval(async () => {
      const next = await signInStatusAction();
      if (!next) return;
      setSignIn(next);
      if (next.state === "done") router.refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [waitingOnCodex, router]);

  function choose(id: string) {
    setSignIn(null);
    setError(null);
    startTransition(async () => {
      const result = await chooseModelAction(id);
      if (result?.error) setError(result.error);
      router.refresh();
    });
  }

  async function start() {
    setBusy(true);
    setError(null);
    setCode("");
    try {
      setSignIn(await startSignInAction());
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      const next = await finishSignInAction(code);
      setSignIn(next);
      if (next?.state === "done") {
        setSignIn(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await signOutAction();
      setSignIn(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="How the writing is done" className="flex flex-col gap-2">
        {OPTIONS.filter((o) => o.id !== "anthropic" || hasApiKey || current === "anthropic").map((o) => {
          const on = o.id === current;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={pending}
              onClick={() => !on && choose(o.id)}
              className={`flex items-start gap-3 rounded-[var(--radius)] border px-3 py-2.5 text-left transition-colors ${on ? "border-ink bg-surface" : "border-hair hover:border-hair-strong"}`}
            >
              <span className={`mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${on ? "border-ink bg-ink text-paper" : "border-hair-strong"}`} aria-hidden>
                {on && <Check size={9} strokeWidth={3} />}
              </span>
              <span>
                <span className="block text-[14px] font-medium text-ink">{o.title}</span>
                <span className="block text-[13px] text-ink-2">{o.detail}</span>
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p className="callout callout-bad" role="alert">
          {error}
        </p>
      )}

      {current === "manual" && <p>Paste mode. Each capture gives you a prompt to paste into Claude or ChatGPT, and you paste the reply back. It works with no further setup.</p>}

      {current === "anthropic" &&
        (ready ? (
          <>
            <p>An API key is set. Captures run by themselves and are billed per token.</p>
            <TestModelButton />
          </>
        ) : (
          <p>No API key is set. Choose another way above, or add a key to the .env file and restart.</p>
        ))}

      {cli && !installed && <p>{TOOL[current]} is not installed where Shortlisted runs. Update Shortlisted to the latest version, or choose another way above.</p>}

      {cli && installed && ready && (
        <>
          <p>{TOOL[current]} is signed in. Captures run by themselves on your own subscription.</p>
          <div className="flex flex-wrap items-start gap-2">
            <TestModelButton />
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={signOut}>
              Sign out
            </button>
          </div>
        </>
      )}

      {cli && installed && !ready && (
        <div className="flex flex-col gap-3">
          {!signIn && (
            <>
              <p>{TOOL[current]} is not signed in yet. Signing in opens the official sign-in page. Shortlisted never sees your password.</p>
              <button type="button" className="btn btn-primary self-start" disabled={busy} onClick={start}>
                {busy ? <Loader2 size={14} className="spin" /> : null} Sign in
              </button>
            </>
          )}

          {signIn && signIn.state === "failed" && (
            <>
              <p className="callout callout-bad" role="alert">
                {signIn.message ?? "The sign-in did not finish."}
              </p>
              <button type="button" className="btn self-start" disabled={busy} onClick={start}>
                {busy ? <Loader2 size={14} className="spin" /> : null} Try again
              </button>
            </>
          )}

          {signIn && signIn.state === "waiting" && signIn.url && (
            <ol className="flex flex-col gap-3">
              <li className="flex flex-wrap items-center gap-2">
                <span className="num w-5 text-xs text-ink-3">01</span>
                <a href={signIn.url} target="_blank" rel="noreferrer" className="btn btn-primary">
                  Open the sign-in page <ArrowUpRight size={13} strokeWidth={1.75} />
                </a>
              </li>
              {signIn.needsCode ? (
                <li className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="num w-5 text-xs text-ink-3">02</span>
                    <span className="text-[13px] font-medium text-ink">Paste the code that page gives you</span>
                  </div>
                  <input className="field font-mono text-xs" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Sign-in code" placeholder="The code from the sign-in page" autoComplete="off" />
                  <button type="button" className="btn self-start" disabled={busy || code.trim().length < 4} onClick={finish}>
                    {busy ? <Loader2 size={14} className="spin" /> : null} Finish sign-in
                  </button>
                </li>
              ) : (
                <li className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="num w-5 text-xs text-ink-3">02</span>
                    <span className="text-[13px] font-medium text-ink">Type this code on that page</span>
                  </div>
                  <code className="num self-start rounded-[var(--radius-sm)] border border-hair bg-surface px-3 py-2 text-[18px] tracking-widest text-ink" aria-label="One-time code">
                    {signIn.userCode}
                  </code>
                  <p className="flex items-center gap-2 text-[13px] text-ink-3" role="status">
                    <Loader2 size={13} className="spin" /> Waiting for you to finish on that page. This updates by itself.
                  </p>
                  <p className="text-[13px] text-ink-3">If the page refuses the code, switch on device code sign-in in your ChatGPT security settings and try again.</p>
                </li>
              )}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
