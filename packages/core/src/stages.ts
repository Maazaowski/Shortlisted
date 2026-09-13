export const STAGES = [
  "SAVED",
  "GENERATED",
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
] as const;
export type StageName = (typeof STAGES)[number];

export const ACTIVE_STAGES: StageName[] = ["SAVED", "GENERATED", "APPLIED", "SCREENING", "INTERVIEW", "OFFER"];
export const TERMINAL_STAGES: StageName[] = ["REJECTED", "WITHDRAWN"];

export const STAGE_LABEL: Record<StageName, string> = {
  SAVED: "Saved",
  GENERATED: "Generated",
  APPLIED: "Applied",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

/** The stage a user most likely wants next. Terminal stages have no next. */
export function nextStage(stage: StageName): StageName | null {
  const i = ACTIVE_STAGES.indexOf(stage);
  if (i === -1 || i === ACTIVE_STAGES.length - 1) return null;
  return ACTIVE_STAGES[i + 1] ?? null;
}

export const VERDICT_LABEL = {
  STRONG: "Strong fit",
  GOOD: "Good fit",
  POSSIBLE: "Possible fit",
  POOR: "Poor fit",
} as const;
