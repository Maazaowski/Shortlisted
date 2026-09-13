// Mirrors ApplicationView in apps/web/lib/applications.ts, CaptureSchema in
// packages/core/src/schemas.ts and the stage tables in packages/core/src/stages.ts.
// The extension cannot import workspace packages, so keep these in step by hand.
export type Stage = "SAVED" | "GENERATED" | "APPLIED" | "SCREENING" | "INTERVIEW" | "OFFER" | "REJECTED" | "WITHDRAWN";
export type Verdict = "STRONG" | "GOOD" | "POSSIBLE" | "POOR";

export const STAGES: Stage[] = ["SAVED", "GENERATED", "APPLIED", "SCREENING", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"];
export const STAGE_LABEL: Record<Stage, string> = {
  SAVED: "Saved",
  GENERATED: "Generated",
  APPLIED: "Applied",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};
export const VERDICT_LABEL: Record<Verdict, string> = {
  STRONG: "Strong fit",
  GOOD: "Good fit",
  POSSIBLE: "Possible fit",
  POOR: "Poor fit",
};

export type ValidationFlag = { kind: string; bulletId: string | null; detail: string };
export type ResumeDiff = {
  headline: { from: string; to: string };
  summary: { from: string; to: string };
  addedBullets: { id: string; text: string }[];
  removedBullets: { id: string; text: string }[];
  reworded: { id: string; from: string; to: string }[];
  reorderedCount: number;
};

export type ApplicationView = {
  id: string;
  stage: Stage;
  generationStatus: "WAITING" | "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
  generationError: string | null;
  needsReply: boolean;
  fitVerdict: Verdict | null;
  fitScore: number | null;
  gaps: string[];
  rejectionReason: string | null;
  job: { id: string; url: string | null; title: string | null; company: string | null; sourceHost: string | null };
  resume: { id: string; version: number; fileName: string; hasFile: boolean; flags: ValidationFlag[]; diff: ResumeDiff | null } | null;
  coverLetter: { id: string; version: number; fileName: string; hasFile: boolean; text: string } | null;
  events: { id: string; fromStage: Stage | null; toStage: Stage; note: string | null; createdAt: string }[];
  notes: { id: string; body: string; createdAt: string }[];
  reminders: { id: string; rule: string; dueAt: string; doneAt: string | null }[];
  createdAt: string;
  updatedAt: string;
};

export type Capture = { url: string | null; pageTitle: string; jsonLd: unknown | null; text: string };
