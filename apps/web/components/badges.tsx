import { STAGE_LABEL, VERDICT_LABEL, type StageName } from "@shortlisted/core/stages";

/** CSS variable holding each stage's colour; see globals.css. */
export const STAGE_VAR: Record<StageName, string> = {
  SAVED: "var(--stage-saved)",
  GENERATED: "var(--stage-generated)",
  APPLIED: "var(--stage-applied)",
  SCREENING: "var(--stage-screening)",
  INTERVIEW: "var(--stage-interview)",
  OFFER: "var(--stage-offer)",
  REJECTED: "var(--stage-rejected)",
  WITHDRAWN: "var(--stage-withdrawn)",
};

export function StageDot({ stage, size = 6 }: { stage: StageName; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: STAGE_VAR[stage] }} aria-hidden />;
}

export function StageTag({ stage }: { stage: StageName }) {
  return (
    <span className="tag tag-ink" style={{ "--tag-color": STAGE_VAR[stage] } as React.CSSProperties}>
      {STAGE_LABEL[stage]}
    </span>
  );
}

type Verdict = keyof typeof VERDICT_LABEL;

const VERDICT_VAR: Record<Verdict, string> = {
  STRONG: "var(--good)",
  GOOD: "var(--good)",
  POSSIBLE: "var(--warn)",
  POOR: "var(--bad)",
};

export function VerdictTag({ verdict, score }: { verdict: Verdict | null; score?: number | null }) {
  if (!verdict) return <span className="tag">Not scored</span>;
  return (
    <span className="tag" style={{ "--tag-color": VERDICT_VAR[verdict] } as React.CSSProperties}>
      {VERDICT_LABEL[verdict]}
      {typeof score === "number" && <span className="num text-ink-3">{score}</span>}
    </span>
  );
}
