import type { StageName } from "./stages.js";

/**
 * The five messages a job search keeps needing. Plain templates filled with
 * what the application already knows, no model call, so nothing in them can
 * be invented. This file has no Node imports: the application page, a client
 * component, loads it as `@shortlisted/core/followups`.
 */

export type FollowupContext = {
  role: string | null;
  company: string | null;
  contactName: string | null;
  yourName: string;
  appliedAt: Date | null;
  interviewAt: Date | null;
};

export type FollowupId = "applied-note" | "follow-up" | "thank-you" | "check-in" | "rejection-reply";

export type FollowupTemplate = {
  id: FollowupId;
  label: string;
  /** When to send it, as a sentence. */
  when: string;
  subject: string;
  body: string;
};

/** Which templates fit a stage, most useful first. */
export const FOLLOWUPS_FOR_STAGE: Record<StageName, FollowupId[]> = {
  SAVED: [],
  GENERATED: ["applied-note"],
  APPLIED: ["follow-up", "applied-note"],
  SCREENING: ["thank-you", "check-in"],
  INTERVIEW: ["thank-you", "check-in"],
  OFFER: [],
  REJECTED: ["rejection-reply"],
  WITHDRAWN: [],
};

function day(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

export function followupTemplates(ctx: FollowupContext): FollowupTemplate[] {
  const role = ctx.role?.trim() || "the role";
  const theRole = ctx.role?.trim() ? `the ${ctx.role.trim()} role` : "the role";
  const company = ctx.company?.trim() || "your company";
  const at = ctx.company?.trim() ? ` at ${ctx.company.trim()}` : "";
  // First name only: "Hi Sara," reads as a person wrote it.
  const first = ctx.contactName?.trim().split(/\s+/)[0];
  const hi = first ? `Hi ${first},` : "Hello,";
  const applied = ctx.appliedAt ? ` on ${day(ctx.appliedAt)}` : " recently";
  const interviewed = ctx.interviewAt ? ` on ${day(ctx.interviewAt)}` : "";
  const sign = `Best regards,\n${ctx.yourName}`;

  return [
    {
      id: "applied-note",
      label: "Note on the day you apply",
      when: "The day you apply, to a recruiter or the hiring manager if you can find one.",
      subject: `Application for ${role}`,
      body: `${hi}\n\nI have just applied for ${theRole}${at}. I am writing so my application has a name attached to it.\n\n[One sentence: the result from your resume that fits this role best.]\n\nMy resume is attached. I would be glad to talk whenever suits you.\n\n${sign}`,
    },
    {
      id: "follow-up",
      label: "Follow-up after ten days",
      when: "Ten days after applying with no reply. Once is enough.",
      subject: `Following up: ${role}`,
      body: `${hi}\n\nI applied for ${theRole}${at}${applied} and wanted to check that my application reached you.\n\nI am still very interested. If anything else would help, such as work samples or references, I can send it today.\n\n${sign}`,
    },
    {
      id: "thank-you",
      label: "Thank-you after an interview",
      when: "The same day as the interview, or the next morning.",
      subject: `Thank you: ${role}`,
      body: `${hi}\n\nThank you for your time${interviewed ? interviewed : " today"}. I enjoyed hearing about [something specific they told you].\n\nIt made me more sure that ${theRole} is a good fit. [One sentence tying your experience to a problem they described.]\n\nPlease tell me if you need anything else from me.\n\n${sign}`,
    },
    {
      id: "check-in",
      label: "Check-in after a quiet interview",
      when: "A week after the date they said you would hear back, or two weeks after the interview.",
      subject: `Checking in: ${role}`,
      body: `${hi}\n\nI wanted to check in on ${theRole}${interviewed ? ` after we spoke${interviewed}` : " after our conversation"}. I know these decisions take time.\n\nI am still interested in joining ${company}. Is there an update on timing, or anything I can add to help?\n\n${sign}`,
    },
    {
      id: "rejection-reply",
      label: "Reply to a rejection",
      when: "Within a day or two. It keeps the door open and costs two minutes.",
      subject: `Re: ${role}`,
      body: `${hi}\n\nThank you for letting me know, and for considering me for ${theRole}.\n\nIf you can share one thing that would have made my application stronger, I would be grateful. And if a role closer to my experience opens${at}, I would like to hear about it.\n\n${sign}`,
    },
  ];
}

/** The templates for a stage, then the rest, so the page can show the first group and tuck the others away. */
export function followupsForStage(stage: StageName, ctx: FollowupContext): { now: FollowupTemplate[]; others: FollowupTemplate[] } {
  const all = followupTemplates(ctx);
  const wanted = FOLLOWUPS_FOR_STAGE[stage];
  const now = wanted.flatMap((id) => all.find((t) => t.id === id) ?? []);
  return { now, others: all.filter((t) => !wanted.includes(t.id)) };
}
