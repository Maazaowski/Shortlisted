import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight, Check, Circle } from "lucide-react";
import { requireUser } from "@/lib/session";
import { IN_DOCKER, setupStatus, type ModelStatus } from "@/lib/setup";
import { RELEASES_URL } from "@/lib/version";
import { TestModelButton } from "@/components/test-model-button";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const user = await requireUser();
  const [status, h] = await Promise.all([setupStatus(user.id), headers()]);
  const address = `http://${h.get("host") ?? "localhost:3000"}`;
  const done = [
    status.model.ready,
    status.bank.ready,
    status.preferences.ready,
    status.extension.ready,
  ].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="enter">
        <p className="label">Setup</p>
        <h1 className="display mt-3 text-[40px]">
          {status.complete ? "Everything is ready" : "Finish setting up"}
        </h1>
        <p className="mt-3 max-w-lg text-ink-2">
          {status.complete
            ? "Open a job posting and click the Shortlisted icon in Chrome."
            : "Each row is checked when you open this page. Refresh after you finish a step."}
        </p>
        <p className="num mt-3 text-xs text-ink-3">{done} of 4 done</p>
      </div>

      <ol className="mt-8 flex flex-col divide-y divide-hair border-y border-hair">
        <Step
          n={1}
          ready={status.model.ready}
          title="A model to do the writing"
        >
          <ModelStep model={status.model} />
        </Step>

        <Step n={2} ready={status.bank.ready} title="Your resume">
          {status.bank.ready ? (
            <p>
              Imported, <span className="num">{status.bank.bullets}</span>{" "}
              bullets in your bank.{" "}
              <Link href="/bank" className="underline">
                Review the bank
              </Link>
            </p>
          ) : (
            <>
              <p>
                Upload the resume you send today, PDF or Word. Every bullet
                becomes an entry you can edit. The file itself is not kept.
              </p>
              <Link href="/onboarding" className="btn btn-primary btn-sm mt-3">
                Import your resume <ArrowRight size={13} strokeWidth={2} />
              </Link>
            </>
          )}
        </Step>

        <Step
          n={3}
          ready={status.preferences.ready}
          title="Where you are and what you want"
        >
          {status.preferences.ready ? (
            <p>
              Saved.{" "}
              <Link href="/settings" className="underline">
                Change settings
              </Link>
            </p>
          ) : (
            <>
              <p>
                Your country, your passport, and the kind of roles you are
                after. Until you save, the defaults assume Pakistan.
              </p>
              <Link
                href="/settings?next=setup"
                className="btn btn-primary btn-sm mt-3"
              >
                Choose settings <ArrowRight size={13} strokeWidth={2} />
              </Link>
            </>
          )}
        </Step>

        <Step n={4} ready={status.extension.ready} title="The Chrome extension">
          {status.extension.ready ? (
            <p>
              Connected. It last reached this app on{" "}
              {status.extension.seenAt?.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              .
            </p>
          ) : (
            <ol className="flex list-decimal flex-col gap-1.5 pl-5">
              <li>
                Download <span className="num">shortlisted-extension.zip</span>{" "}
                from the{" "}
                <a
                  href={RELEASES_URL}
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  latest release
                </a>{" "}
                and unzip it.
              </li>
              <li>
                In Chrome, open <span className="num">chrome://extensions</span>{" "}
                and turn on Developer mode.
              </li>
              <li>Click Load unpacked and choose the unzipped folder.</li>
              <li>
                Click the Shortlisted icon. If it cannot connect, open its
                Settings and enter <span className="num">{address}</span>.
              </li>
            </ol>
          )}
        </Step>
      </ol>

      {status.complete && (
        <Link href="/board" className="btn btn-primary enter mt-8">
          Go to the board <ArrowRight size={14} strokeWidth={2} />
        </Link>
      )}
    </div>
  );
}

function Step({
  n,
  ready,
  title,
  children,
}: {
  n: number;
  ready: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li
      className="enter flex gap-4 py-5"
      style={{ "--i": n } as React.CSSProperties}
    >
      <span
        className="mt-0.5 shrink-0"
        style={{ color: ready ? "var(--good)" : "var(--ink-3)" }}
      >
        {ready ? (
          <Check size={16} strokeWidth={2} aria-label="Done" />
        ) : (
          <Circle size={16} strokeWidth={1.75} aria-label="Not done" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-medium">{title}</h2>
        <div className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
          {children}
        </div>
      </div>
    </li>
  );
}

function Command({ children }: { children: string }) {
  return (
    <code className="num mt-2 block overflow-x-auto rounded-[var(--radius-sm)] border border-hair bg-surface px-3 py-2 text-[12.5px] text-ink">
      {children}
    </code>
  );
}

function ModelStep({ model }: { model: ModelStatus }) {
  if (model.provider === "manual") {
    return (
      <>
        <p>
          Paste mode. Each capture gives you a prompt to paste into Claude or
          ChatGPT, and you paste the reply back. It works with no further setup.
        </p>
        <p className="mt-2">
          To skip the pasting and use your Claude or ChatGPT subscription
          directly, set this in the <span className="num">.env</span> file in
          the Shortlisted folder, then restart.
        </p>
        <Command>SHORTLISTED_PROVIDER=claude-cli</Command>
        <p className="mt-2 text-[13px] text-ink-3">
          Use <span className="num">codex-cli</span> for ChatGPT. Restart with{" "}
          <span className="num">
            {IN_DOCKER ? "docker compose up -d" : "pnpm web and pnpm worker"}
          </span>
          .
        </p>
      </>
    );
  }
  if (model.provider === "anthropic") {
    return model.ready ? (
      <>
        <p>
          An API key is set. Captures run by themselves and are billed per
          token.
        </p>
        <div className="mt-3">
          <TestModelButton />
        </div>
      </>
    ) : (
      <p>
        The provider is set to the Anthropic API but no key is set. Add{" "}
        <span className="num">ANTHROPIC_API_KEY</span> to the{" "}
        <span className="num">.env</span> file and restart.
      </p>
    );
  }
  if (!model.installed) {
    return (
      <p>
        {model.label} is chosen but is not installed where Shortlisted runs.{" "}
        {IN_DOCKER
          ? "Update to the latest version with docker compose pull, then docker compose up -d."
          : "Install it, or run Shortlisted with Docker, which includes it."}
      </p>
    );
  }
  if (!model.ready) {
    return (
      <>
        <p>
          {model.label} is not signed in. Open a terminal in the Shortlisted
          folder and run this. It prints a link. Open the link, sign in, and
          paste the code back into the terminal.
        </p>
        <Command>{model.signInCommand}</Command>
        <p className="mt-2 text-[13px] text-ink-3">
          The sign-in stays on this machine. Refresh this page when it is done.
        </p>
      </>
    );
  }
  return (
    <>
      <p>
        {model.label} is signed in. Captures run by themselves on your own
        subscription.
      </p>
      <div className="mt-3">
        <TestModelButton />
      </div>
    </>
  );
}
