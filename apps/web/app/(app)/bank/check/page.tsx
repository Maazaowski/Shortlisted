import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { withUser } from "@shortlisted/db";
import { checkCv, type CvFinding } from "@shortlisted/core";
import { requireUser } from "@/lib/session";
import { loadBankFor } from "@/lib/applications";

export const dynamic = "force-dynamic";

export default async function CvCheckPage() {
  const user = await requireUser();
  const bank = await withUser(user.id, (tx) => loadBankFor(tx, user.id));

  if (!bank) {
    return (
      <div className="card enter max-w-md">
        <h1 className="display text-[24px]">Nothing to check yet</h1>
        <p className="mt-2 text-ink-2">Import your resume first. The check reads your experience bank.</p>
        <Link href="/onboarding" className="btn btn-primary mt-4">
          Import your resume <ArrowRight size={14} strokeWidth={2} />
        </Link>
      </div>
    );
  }

  const result = checkCv(bank);
  const fixes = result.findings.filter((f) => f.severity === "fix");
  const improvements = result.findings.filter((f) => f.severity === "improve");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <Link href="/bank" className="enter flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft size={13} strokeWidth={1.75} /> Experience bank
      </Link>

      <header className="enter flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="display text-[34px]">CV check</h1>
          <p className="mt-2 max-w-xl text-ink-2">
            Fixed rules run over your experience bank, with an eye on applying abroad. Nothing is sent anywhere and nothing is changed. Fix a line in the bank and open this page again.
          </p>
        </div>
        <div className="text-right">
          <div className="label">Score</div>
          <div className="mt-1">
            <span className="display text-[44px] leading-none">{result.score}</span>
            <span className="num text-ink-3"> / 100</span>
          </div>
        </div>
      </header>

      <div className="progress enter" aria-hidden style={{ "--i": 1 } as React.CSSProperties}>
        <span style={{ width: `${result.score}%` }} />
      </div>

      {result.findings.length === 0 && <p className="callout callout-good">Every rule passed. The next gain is in tailoring each application.</p>}

      <Findings title="Fix these first" findings={fixes} />
      <Findings title="Would make it stronger" findings={improvements} />

      {result.passed.length > 0 && (
        <section>
          <h2 className="label">Already in order</h2>
          <ul className="mt-3 flex flex-col gap-1.5 text-[13.5px] text-ink-2">
            {result.passed.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <Check size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-good" /> {p}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="border-t border-hair pt-4 text-xs text-ink-3">
        The resume this tool makes has no photo, one column and plain text that screening software can read, so those are not checked here. The rules cannot judge whether a bullet is true or relevant. That part is yours.
      </footer>
    </div>
  );
}

function Findings({ title, findings }: { title: string; findings: CvFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <section>
      <h2 className="label">{title}</h2>
      <ul className="mt-3 flex flex-col divide-y divide-hair border-y border-hair">
        {findings.map((f) => (
          <li key={f.id} className="py-4">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-[15px] font-medium">{f.title}</h3>
              <span className="num shrink-0 text-[11px] text-ink-3">{f.points} points</span>
            </div>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{f.detail}</p>
            {f.examples.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5 border-l border-hair-strong pl-3 text-[13px] text-ink-2">
                {f.examples.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <Link href="/bank" className="btn btn-sm mt-3">
        Edit the bank <ArrowRight size={13} strokeWidth={2} />
      </Link>
    </section>
  );
}
