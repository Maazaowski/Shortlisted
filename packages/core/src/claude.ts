import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ImportedBankSchema, ParsedJobSchema, SelectionSchema, type Bank, type ImportedBank, type ParsedJob, type Selection } from "./schemas.js";
import { IMPORT_SYSTEM, PARSE_SYSTEM, SELECT_SYSTEM } from "./prompts.js";
import type { FitResult } from "./fit.js";

export const MODEL = process.env.SHORTLISTED_MODEL ?? "claude-opus-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export class ModelRefusedError extends Error {
  constructor(public readonly stage: string) {
    super(`The model declined the ${stage} request`);
  }
}

/** Step 1: posting text to structured job. */
export async function parseJob(rawText: string): Promise<ParsedJob> {
  const res = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(ParsedJobSchema) },
    system: PARSE_SYSTEM,
    messages: [{ role: "user", content: rawText }],
  });
  if (res.stop_reason === "refusal") throw new ModelRefusedError("parse");
  if (!res.parsed_output) throw new Error("Parse returned no structured output");
  return res.parsed_output;
}

/**
 * Step 3: pick and order bullets from the bank for this job. The bank goes in
 * the system prompt with a cache breakpoint because it is the same for every
 * capture a user makes; the job is the only thing that changes.
 */
export async function selectForJob(bank: Bank, job: ParsedJob, fit: FitResult, note?: string | null): Promise<Selection> {
  const jobBlock = [
    `Job title: ${job.title}`,
    `Company: ${job.company}`,
    `Seniority: ${job.seniority}`,
    `Must-have skills: ${job.mustHaveSkills.join(", ") || "none listed"}`,
    `Nice-to-have skills: ${job.niceToHaveSkills.join(", ") || "none listed"}`,
    `Keywords: ${job.keywords.join(", ") || "none"}`,
    `Responsibilities:\n${job.responsibilities.map((r) => `- ${r}`).join("\n") || "- none listed"}`,
    "",
    `Fit computed by code: ${fit.verdict} (${fit.score}/100). Gaps the bank does not cover: ${fit.gaps.join(", ") || "none"}. Do not paper over the gaps; do not claim them.`,
    note ? `\nInstruction from the candidate for this regeneration: ${note}` : "",
  ].join("\n");

  const res = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "medium", format: zodOutputFormat(SelectionSchema) },
    system: [
      { type: "text", text: SELECT_SYSTEM },
      { type: "text", text: `Experience bank:\n${JSON.stringify(bank, null, 1)}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: jobBlock }],
  });
  if (res.stop_reason === "refusal") throw new ModelRefusedError("select");
  if (!res.parsed_output) throw new Error("Select returned no structured output");
  return res.parsed_output;
}

/** Onboarding: resume text to a draft bank the user then expands. */
export async function importBankFromResume(resumeText: string): Promise<ImportedBank> {
  const res = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 12000,
    output_config: { effort: "medium", format: zodOutputFormat(ImportedBankSchema) },
    system: IMPORT_SYSTEM,
    messages: [{ role: "user", content: resumeText }],
  });
  if (res.stop_reason === "refusal") throw new ModelRefusedError("import");
  if (!res.parsed_output) throw new Error("Import returned no structured output");
  return res.parsed_output;
}
