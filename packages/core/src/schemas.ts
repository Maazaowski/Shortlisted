import { z } from "zod";

// ---------------------------------------------------------------------------
// Experience bank, as handed to the model. Built from Profile + BankEntry +
// BankBullet rows. Bullet ids are the contract: the model may only cite them.
// ---------------------------------------------------------------------------

export const BankBulletSchema = z.object({
  id: z.string(),
  text: z.string(),
  skills: z.array(z.string()),
  metric: z.string().nullable(),
  inBase: z.boolean(),
});
export type BankBullet = z.infer<typeof BankBulletSchema>;

export const BankEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(["ROLE", "PROJECT"]),
  organization: z.string(),
  title: z.string(),
  location: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  url: z.string().nullable(),
  bullets: z.array(BankBulletSchema),
});
export type BankEntry = z.infer<typeof BankEntrySchema>;

export const SkillGroupSchema = z.object({ name: z.string(), skills: z.array(z.string()) });
export type SkillGroup = z.infer<typeof SkillGroupSchema>;

export const EducationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
});
export type Education = z.infer<typeof EducationSchema>;

export const LinkSchema = z.object({ label: z.string(), url: z.string() });

export const BankSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  links: z.array(LinkSchema),
  headline: z.string(),
  summary: z.string(),
  skillGroups: z.array(SkillGroupSchema),
  education: z.array(EducationSchema),
  entries: z.array(BankEntrySchema),
});
export type Bank = z.infer<typeof BankSchema>;

// ---------------------------------------------------------------------------
// Parsed job posting (model output, step 1)
// ---------------------------------------------------------------------------

export const ParsedJobSchema = z.object({
  isJobPosting: z.boolean().describe("false if the page is not a single job posting"),
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  seniority: z.enum(["intern", "junior", "mid", "senior", "staff", "lead", "manager", "unknown"]),
  mustHaveSkills: z.array(z.string()).describe("Required skills and technologies, lowercase, one per item"),
  niceToHaveSkills: z.array(z.string()).describe("Preferred skills, lowercase, one per item"),
  keywords: z.array(z.string()).describe("Other phrases a screener would search for"),
  responsibilities: z.array(z.string()),
  yearsExperience: z.number().nullable(),
});
export type ParsedJob = z.infer<typeof ParsedJobSchema>;

// ---------------------------------------------------------------------------
// Selection (model output, step 3)
// ---------------------------------------------------------------------------

export const SelectedBulletSchema = z.object({
  id: z.string().describe("A bullet id from the bank. Never invent one."),
  rewording: z
    .string()
    .nullable()
    .describe("Optional light rewording. Keep every number and tool name from the original. Null to use the original text."),
});

export const SelectedEntrySchema = z.object({
  entryId: z.string(),
  bullets: z.array(SelectedBulletSchema).describe("In priority order, most relevant first"),
});

export const SelectionSchema = z.object({
  headline: z.string().describe("Resume headline. Use the job title when the fit is honest."),
  summary: z.string().describe("Two or three sentences. Only claims supported by the bank."),
  skillGroups: z.array(SkillGroupSchema).describe("Reordered so the most relevant group is first"),
  entries: z.array(SelectedEntrySchema).describe("Every entry worth including, in resume order"),
  coverLetter: z.string().describe("Under 150 words. Plain, specific, no flattery, no buzzword lists."),
  reasoning: z.string().describe("One short paragraph on what was emphasised and why"),
});
export type Selection = z.infer<typeof SelectionSchema>;

// ---------------------------------------------------------------------------
// Bank import (model output, onboarding)
// ---------------------------------------------------------------------------

export const ImportedBankSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  links: z.array(LinkSchema),
  headline: z.string(),
  summary: z.string(),
  skillGroups: z.array(SkillGroupSchema),
  education: z.array(EducationSchema),
  entries: z.array(
    z.object({
      kind: z.enum(["ROLE", "PROJECT"]),
      organization: z.string(),
      title: z.string(),
      location: z.string().nullable(),
      startDate: z.string().nullable().describe("YYYY-MM"),
      endDate: z.string().nullable().describe("YYYY-MM, null if current"),
      url: z.string().nullable(),
      bullets: z.array(
        z.object({
          text: z.string(),
          skills: z.array(z.string()).describe("lowercase technology and skill tags"),
          metric: z.string().nullable(),
        }),
      ),
    }),
  ),
});
export type ImportedBank = z.infer<typeof ImportedBankSchema>;

// ---------------------------------------------------------------------------
// Validation and diff (code output)
// ---------------------------------------------------------------------------

export const ValidationFlagSchema = z.object({
  kind: z.enum(["missing_bullet", "missing_entry", "added_number", "new_term", "summary_number", "empty"]),
  bulletId: z.string().nullable(),
  detail: z.string(),
});
export type ValidationFlag = z.infer<typeof ValidationFlagSchema>;

export type ResumeDiff = {
  headline: { from: string; to: string };
  summary: { from: string; to: string };
  addedBullets: { id: string; text: string }[];
  removedBullets: { id: string; text: string }[];
  reworded: { id: string; from: string; to: string }[];
  reorderedCount: number;
};

// ---------------------------------------------------------------------------
// Capture payload from the extension
// ---------------------------------------------------------------------------

export const CaptureSchema = z.object({
  /** Null for a pasted posting with no source page. */
  url: z.string().url().nullable().default(null),
  pageTitle: z.string().default(""),
  jsonLd: z.unknown().nullable().default(null),
  text: z.string().default(""),
});
export type Capture = z.infer<typeof CaptureSchema>;
