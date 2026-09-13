import { z } from "zod";
import { ImportedBankSchema, ParsedJobSchema, SelectionSchema, type Bank, type ImportedBank, type ParsedJob, type Selection } from "./schemas.js";
import { IMPORT_SYSTEM, PARSE_SYSTEM, SELECT_SYSTEM } from "./prompts.js";

/**
 * The manual provider. The same prompts and schemas as the API path, but the
 * model is reached by the user pasting. Bank ids are long cuids, which a
 * pasted reply would mangle, so the prompt shows short aliases (e1, b3) and
 * parseSelectionReply() maps them back. Anything that does not map is left
 * as is and the validator drops and flags it, exactly as with the API.
 */

export type Aliases = { entries: Map<string, string>; bullets: Map<string, string>; certifications: Map<string, string> };

/** Deterministic aliases from bank order: entries e1.., bullets b1.. across all entries, certifications c1... */
export function bankAliases(bank: Bank): Aliases {
  const entries = new Map<string, string>();
  const bullets = new Map<string, string>();
  const certifications = new Map<string, string>();
  let b = 0;
  bank.entries.forEach((e, i) => {
    entries.set(`e${i + 1}`, e.id);
    for (const bullet of e.bullets) bullets.set(`b${++b}`, bullet.id);
  });
  bank.certifications.forEach((c, i) => certifications.set(`c${i + 1}`, c.id));
  return { entries, bullets, certifications };
}

function renderBank(bank: Bank): string {
  const lines: string[] = [];
  lines.push(`Name: ${bank.fullName}`);
  lines.push(`Current headline: ${bank.headline}`);
  lines.push(`Current summary: ${bank.summary}`);
  if (bank.skillGroups.length) lines.push(`Skill groups: ${bank.skillGroups.map((g) => `${g.name}: ${g.skills.join(", ")}`).join(" | ")}`);
  if (bank.certifications.length) {
    lines.push("Certifications:");
    bank.certifications.forEach((c, i) => lines.push(`- c${i + 1}: ${[c.name, c.issuer, c.date].filter(Boolean).join(", ")}`));
  }
  let b = 0;
  bank.entries.forEach((e, i) => {
    const dates = `${e.startDate ?? "?"} to ${e.endDate ?? "present"}`;
    lines.push("");
    lines.push(`### e${i + 1}: ${e.title}, ${e.organization} (${e.kind.toLowerCase()}, ${dates})`);
    for (const bullet of e.bullets) {
      const tags = bullet.skills.length ? ` [${bullet.skills.join(", ")}]` : "";
      const metric = bullet.metric ? ` (metric: ${bullet.metric})` : "";
      lines.push(`- b${++b}: ${bullet.text}${metric}${tags}`);
    }
  });
  return lines.join("\n");
}

const SELECTION_REPLY_SHAPE = `{
  "parsed": {
    "isJobPosting": true,
    "title": "", "company": "", "location": null,
    "seniority": "intern|junior|mid|senior|staff|lead|manager|unknown",
    "mustHaveSkills": [], "niceToHaveSkills": [], "keywords": [], "responsibilities": [],
    "yearsExperience": null
  },
  "selection": {
    "headline": "",
    "summary": "",
    "skillGroups": [{ "name": "", "skills": [] }],
    "entries": [{ "entryId": "e1", "bullets": [{ "id": "b1", "rewording": null }] }],
    "certifications": ["c1"],
    "coverLetter": ""
  }
}`;

/** The prompt the user pastes into Claude for one posting. */
export function buildSelectionPrompt(bank: Bank, postingText: string, note?: string | null): string {
  return [
    "You are doing two jobs in one reply: parse a job posting, then tailor a resume to it from an experience bank.",
    "",
    "## Part 1, parse the posting",
    PARSE_SYSTEM,
    "",
    "## Part 2, select from the bank",
    SELECT_SYSTEM.replace("Return exactly the schema requested.", "").trim(),
    "",
    "Cite entries as e1, e2, bullets as b1, b2 and certifications as c1, c2 exactly as labelled below. Never invent a label.",
    note ? `\nInstruction from the candidate for this regeneration: ${note}` : "",
    "",
    "## Experience bank",
    renderBank(bank),
    "",
    "## Job posting",
    postingText.trim(),
    "",
    "## Reply",
    "Reply with one JSON object and nothing else, in this exact shape:",
    "```json",
    SELECTION_REPLY_SHAPE,
    "```",
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

const SelectionReplySchema = z.object({
  parsed: ParsedJobSchema,
  selection: SelectionSchema.extend({ reasoning: z.string().default(""), certifications: z.array(z.string()).default([]) }),
});

export class ManualReplyError extends Error {}

/** Pulls the first JSON object out of a pasted reply, tolerating code fences and chatter around it. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new ManualReplyError("No JSON object found in the reply. Paste the whole reply, including the braces.");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    throw new ManualReplyError(`The reply is not valid JSON: ${(err as Error).message}`);
  }
}

function describeIssue(err: z.ZodError): string {
  const first = err.issues[0];
  if (!first) return "The reply does not match the expected shape.";
  return `The reply does not match the expected shape at ${first.path.join(".") || "the top level"}: ${first.message}`;
}

/** Validates a pasted selection reply and maps aliases back to bank ids. */
export function parseSelectionReply(text: string, bank: Bank): { parsed: ParsedJob; selection: Selection } {
  const result = SelectionReplySchema.safeParse(extractJson(text));
  if (!result.success) throw new ManualReplyError(describeIssue(result.error));
  const { entries, bullets, certifications } = bankAliases(bank);
  const selection: Selection = {
    ...result.data.selection,
    entries: result.data.selection.entries.map((e) => ({
      entryId: entries.get(e.entryId) ?? e.entryId,
      bullets: e.bullets.map((b) => ({ id: bullets.get(b.id) ?? b.id, rewording: b.rewording })),
    })),
    certifications: result.data.selection.certifications.map((c) => certifications.get(c) ?? c),
  };
  return { parsed: result.data.parsed, selection };
}

const IMPORT_REPLY_SHAPE = `{
  "fullName": "", "email": "", "phone": null, "location": null,
  "links": [{ "label": "", "url": "" }],
  "headline": "", "summary": "",
  "skillGroups": [{ "name": "", "skills": [] }],
  "education": [{ "institution": "", "degree": "", "field": null, "start": null, "end": null, "gpa": null, "honors": null }],
  "certifications": [{ "name": "", "issuer": null, "date": null, "url": null }],
  "entries": [{
    "kind": "ROLE|PROJECT", "organization": "", "title": "", "location": null,
    "startDate": "YYYY-MM", "endDate": null, "url": null,
    "bullets": [{ "text": "", "skills": [], "metric": null }]
  }]
}`;

/** The prompt the user pastes into Claude to turn a resume into a bank. */
export function buildImportPrompt(resumeText: string): string {
  return [IMPORT_SYSTEM, "", "## Resume", resumeText.trim(), "", "## Reply", "Reply with one JSON object and nothing else, in this exact shape:", "```json", IMPORT_REPLY_SHAPE, "```"].join("\n");
}

export function parseImportReply(text: string): ImportedBank {
  const result = ImportedBankSchema.safeParse(extractJson(text));
  if (!result.success) throw new ManualReplyError(describeIssue(result.error));
  return result.data;
}
