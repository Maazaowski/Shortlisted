import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ImportedBankSchema, ParsedJobSchema, SelectionSchema, type Bank, type ImportedBank, type ParsedJob, type Selection } from "./schemas.js";
import { IMPORT_SYSTEM, PARSE_SYSTEM, SELECT_SYSTEM, renderJobBlock } from "./prompts.js";
import type { FitResult } from "./fit.js";
import { isCliProvider, provider } from "./provider.js";
import { askCli, runCli } from "./cli.js";
import { buildImportPrompt, buildParsePrompt, buildSelectPrompt, parseImportReply, parseParseReply, parseSelectReply } from "./manual.js";

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
  const p = provider();
  if (isCliProvider(p)) return askCli(p, "parse", buildParsePrompt(rawText), parseParseReply);
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
  const jobBlock = renderJobBlock(job, fit, note);
  const p = provider();
  if (isCliProvider(p)) return askCli(p, "select", buildSelectPrompt(bank, jobBlock), (text) => parseSelectReply(text, bank));

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
  const p = provider();
  if (isCliProvider(p)) return askCli(p, "import", buildImportPrompt(resumeText), parseImportReply);
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

/**
 * One tiny real call, for the setup checklist's Test button. Resolves when the
 * chosen provider answered; rejects with the reason when it did not. Manual
 * mode has nothing to test.
 */
export async function pingModel(): Promise<void> {
  const p = provider();
  if (p === "manual") return;
  const prompt = "Reply with the single word: ready";
  if (isCliProvider(p)) {
    await runCli(p, prompt);
    return;
  }
  const res = await getClient().messages.create({ model: MODEL, max_tokens: 16, messages: [{ role: "user", content: prompt }] });
  if (res.stop_reason === "refusal") throw new ModelRefusedError("test");
}
