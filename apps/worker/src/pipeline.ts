import { Prisma, withUser } from "@shortlisted/db";
import {
  ParsedJobSchema,
  SelectionSchema,
  TypstNotFoundError,
  buildCoverLetterTypst,
  buildResumeTypst,
  compileTypst,
  diffAgainstBase,
  documentKey,
  parseJob,
  resumeFileName,
  scoreFit,
  selectForJob,
  storageFromEnv,
  validateSelection,
  type ParsedJob,
} from "@shortlisted/core";
import { REPO_ROOT } from "./env.js";
import { loadBank } from "./bank.js";

export type GenerateJob = { applicationId: string; userId: string; note?: string | null };

const storage = storageFromEnv(REPO_ROOT);

/**
 * The seven steps from docs/design.md: parse, score, select, validate, render,
 * store, advance. Parse and select are model calls; the rest is code.
 */
export async function runGeneration(job: GenerateJob): Promise<void> {
  const { applicationId, userId, note } = job;

  try {
    // Load and mark running.
    const ctx = await withUser(userId, async (tx) => {
      const app = await tx.application.findUnique({ where: { id: applicationId }, include: { job: true } });
      if (!app) throw new Error(`Application ${applicationId} not found for user`);
      await tx.application.update({ where: { id: applicationId }, data: { generationStatus: "RUNNING", generationError: null } });
      const loaded = await loadBank(tx, userId);
      if (!loaded) throw new Error("No profile yet. Finish onboarding first.");
      return { app, ...loaded };
    });

    // Manual provider: the user pasted the parsed posting and the selection,
    // so there are no model calls in this run. The parse landed on the job
    // when the reply was accepted; the selection waits on the application.
    // Replies pasted before certifications existed have no list; treat that as none.
    const pasted = ctx.app.pendingSelection ? SelectionSchema.parse({ certifications: [], ...(ctx.app.pendingSelection as object) }) : null;

    // 1. Parse (skipped when a previous run already parsed this job).
    let parsed: ParsedJob;
    if (ctx.app.job.parsed) {
      parsed = ParsedJobSchema.parse(ctx.app.job.parsed);
    } else if (pasted) {
      throw new Error("The pasted reply had no parsed posting. Paste it again.");
    } else {
      parsed = await parseJob(ctx.app.job.rawText);
      await withUser(userId, (tx) =>
        tx.job.update({
          where: { id: ctx.app.jobId },
          data: { parsed: parsed as unknown as Prisma.InputJsonValue, title: parsed.title || null, company: parsed.company || null },
        }),
      );
    }
    if (!parsed.isJobPosting) {
      await fail(userId, applicationId, "This page does not look like a single job posting.");
      return;
    }

    // 2. Score fit (code).
    const fit = scoreFit(ctx.bank, parsed);
    await withUser(userId, (tx) =>
      tx.application.update({
        where: { id: applicationId },
        data: { fitVerdict: fit.verdict, fitScore: fit.score, gaps: fit.gaps },
      }),
    );
    // A poor fit stops the pipeline to save the select call. With a pasted
    // reply there is nothing to save and the user has already done the work.
    if (fit.verdict === "POOR" && !pasted) {
      await withUser(userId, (tx) =>
        tx.application.update({
          where: { id: applicationId },
          data: { generationStatus: "SKIPPED", generationError: "Poor fit. Nothing generated." },
        }),
      );
      return;
    }

    // 3. Select (model) and 4. validate (code).
    const raw = pasted ?? (await selectForJob(ctx.bank, parsed, fit, note));
    const { selection, flags } = validateSelection(ctx.bank, raw);
    const diff = diffAgainstBase(ctx.bank, selection);

    // 5. Render and 6. store.
    const version = await withUser(userId, async (tx) => {
      const last = await tx.document.findFirst({ where: { applicationId, type: "RESUME" }, orderBy: { version: "desc" } });
      return (last?.version ?? 0) + 1;
    });
    const fileName = resumeFileName(ctx.fileNameFormat, { name: ctx.bank.fullName, title: parsed.title, company: parsed.company });
    const coverFileName = fileName.replace(/\.pdf$/i, "") + " - Cover Letter.pdf";

    let resumeKey: string | null = null;
    let coverKey: string | null = null;
    let renderError: string | null = null;
    try {
      const resumePdf = await compileTypst(buildResumeTypst(ctx.bank, selection));
      resumeKey = documentKey(userId, applicationId, "RESUME", version, "pdf");
      await storage.put(resumeKey, resumePdf, "application/pdf");
      const coverPdf = await compileTypst(buildCoverLetterTypst(ctx.bank, selection.coverLetter, parsed));
      coverKey = documentKey(userId, applicationId, "COVER_LETTER", version, "pdf");
      await storage.put(coverKey, coverPdf, "application/pdf");
    } catch (err) {
      renderError = err instanceof TypstNotFoundError ? err.message : `Render failed: ${(err as Error).message}`;
    }

    // 7. Advance.
    await withUser(userId, async (tx) => {
      await tx.document.create({
        data: {
          userId,
          applicationId,
          type: "RESUME",
          version,
          selection: selection as unknown as Prisma.InputJsonValue,
          flags: flags as unknown as Prisma.InputJsonValue,
          diff: diff as unknown as Prisma.InputJsonValue,
          fileName,
          fileKey: resumeKey,
        },
      });
      await tx.document.create({
        data: {
          userId,
          applicationId,
          type: "COVER_LETTER",
          version,
          selection: { text: selection.coverLetter } as Prisma.InputJsonValue,
          flags: [],
          fileName: coverFileName,
          fileKey: coverKey,
        },
      });
      // Generated means a PDF exists. Without one the selection and diff are
      // still saved, so Regenerate after installing Typst does not pay for
      // another model call on the parse side, and the stage stays Saved.
      const app = await tx.application.findUniqueOrThrow({ where: { id: applicationId } });
      if (app.stage === "SAVED" && resumeKey) {
        await tx.application.update({ where: { id: applicationId }, data: { stage: "GENERATED" } });
        await tx.stageEvent.create({ data: { userId, applicationId, fromStage: "SAVED", toStage: "GENERATED", note: "Documents generated" } });
      }
      await tx.application.update({
        where: { id: applicationId },
        data: { generationStatus: "DONE", generationError: renderError, regenerateNote: null, pendingSelection: Prisma.DbNull },
      });
    });
  } catch (err) {
    await fail(userId, applicationId, (err as Error).message);
    throw err;
  }
}

async function fail(userId: string, applicationId: string, message: string) {
  await withUser(userId, (tx) =>
    tx.application.update({ where: { id: applicationId }, data: { generationStatus: "FAILED", generationError: message } }),
  );
}
