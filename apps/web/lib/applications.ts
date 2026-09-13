import "server-only";
import { Prisma, withUser, type Stage, type Tx } from "@shortlisted/db";
import {
  BankSchema,
  buildSelectionPrompt,
  normalizeCapture,
  parseSelectionReply,
  provider,
  type Bank,
  type Capture,
  type ResumeDiff,
  type ValidationFlag,
} from "@shortlisted/core";
import { enqueueGeneration } from "./queue";

/** The single application shape the panel, the board and the detail page read. */
export type ApplicationView = {
  id: string;
  stage: Stage;
  generationStatus: "WAITING" | "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
  generationError: string | null;
  /** Manual provider: the app is waiting for the user to paste the model's reply. */
  needsReply: boolean;
  fitVerdict: "STRONG" | "GOOD" | "POSSIBLE" | "POOR" | null;
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

export async function createApplicationFromCapture(userId: string, capture: Capture): Promise<{ id: string; existing: boolean }> {
  const n = normalizeCapture(capture);
  if (n.rawText.trim().length < 80) throw new Error("Not enough text on this page to read a job posting.");
  const manual = provider() === "manual";

  const result = await withUser(userId, async (tx) => {
    let job = await tx.job.findFirst({ where: { userId, contentHash: n.contentHash } });
    if (!job && capture.url) job = await tx.job.findFirst({ where: { userId, url: capture.url } });
    if (job) {
      const app = await tx.application.findFirst({ where: { jobId: job.id }, orderBy: { createdAt: "desc" } });
      if (app) return { id: app.id, existing: true };
    } else {
      job = await tx.job.create({
        data: {
          userId,
          url: capture.url,
          sourceHost: n.sourceHost,
          title: n.title,
          company: n.company,
          rawText: n.rawText,
          contentHash: n.contentHash,
        },
      });
    }
    const app = await tx.application.create({ data: { userId, jobId: job.id, stage: "SAVED", generationStatus: manual ? "WAITING" : "QUEUED" } });
    await tx.stageEvent.create({ data: { userId, applicationId: app.id, fromStage: null, toStage: "SAVED", note: "Captured" } });
    return { id: app.id, existing: false };
  });

  if (!result.existing && !manual) await enqueueGeneration({ applicationId: result.id, userId });
  return result;
}

export async function getApplicationView(userId: string, id: string): Promise<ApplicationView | null> {
  return withUser(userId, async (tx) => {
    const app = await tx.application.findUnique({
      where: { id },
      include: {
        job: true,
        documents: { orderBy: { version: "desc" } },
        stageEvents: { orderBy: { createdAt: "asc" } },
        notes: { orderBy: { createdAt: "desc" } },
        reminders: { orderBy: { dueAt: "asc" } },
      },
    });
    if (!app) return null;
    const resume = app.documents.find((d) => d.type === "RESUME") ?? null;
    const cover = app.documents.find((d) => d.type === "COVER_LETTER") ?? null;
    return {
      id: app.id,
      stage: app.stage,
      generationStatus: app.generationStatus,
      generationError: app.generationError,
      needsReply: app.generationStatus === "WAITING",
      fitVerdict: app.fitVerdict,
      fitScore: app.fitScore,
      gaps: app.gaps,
      rejectionReason: app.rejectionReason,
      job: { id: app.job.id, url: app.job.url, title: app.job.title, company: app.job.company, sourceHost: app.job.sourceHost },
      resume: resume
        ? {
            id: resume.id,
            version: resume.version,
            fileName: resume.fileName,
            hasFile: Boolean(resume.fileKey),
            flags: resume.flags as ValidationFlag[],
            diff: (resume.diff as ResumeDiff | null) ?? null,
          }
        : null,
      coverLetter: cover
        ? {
            id: cover.id,
            version: cover.version,
            fileName: cover.fileName,
            hasFile: Boolean(cover.fileKey),
            text: (cover.selection as { text?: string }).text ?? "",
          }
        : null,
      events: app.stageEvents.map((e) => ({ id: e.id, fromStage: e.fromStage, toStage: e.toStage, note: e.note, createdAt: e.createdAt.toISOString() })),
      notes: app.notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString() })),
      reminders: app.reminders.map((r) => ({ id: r.id, rule: r.rule, dueAt: r.dueAt.toISOString(), doneAt: r.doneAt?.toISOString() ?? null })),
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
    };
  });
}

/** The latest application for a page URL, ignoring the query string and hash. */
export async function findByUrl(userId: string, url: string): Promise<ApplicationView | null> {
  const stripped = url.split("#")[0]!.split("?")[0]!;
  const id = await withUser(userId, async (tx) => {
    const job = await tx.job.findFirst({
      where: { userId, OR: [{ url }, { url: stripped }, { url: { startsWith: `${stripped}?` } }] },
      orderBy: { createdAt: "desc" },
      include: { applications: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    return job?.applications[0]?.id ?? null;
  });
  return id ? getApplicationView(userId, id) : null;
}

/**
 * The only way a stage changes. Writes the new stage and the event together.
 * Leaving Applied closes any open follow-up reminder; entering Applied clears
 * old ones so the ten-day clock starts again.
 */
export async function changeStage(userId: string, id: string, toStage: Stage, note?: string | null): Promise<void> {
  await withUser(userId, async (tx) => {
    const app = await tx.application.findUniqueOrThrow({ where: { id } });
    if (app.stage === toStage) return;
    await tx.application.update({
      where: { id },
      data: { stage: toStage, rejectionReason: toStage === "REJECTED" ? note ?? app.rejectionReason : app.rejectionReason },
    });
    await tx.stageEvent.create({ data: { userId, applicationId: id, fromStage: app.stage, toStage, note: note ?? null } });
    if (app.stage === "APPLIED") {
      await tx.reminder.updateMany({ where: { applicationId: id, doneAt: null }, data: { doneAt: new Date() } });
    }
    if (toStage === "APPLIED") {
      await tx.reminder.deleteMany({ where: { applicationId: id } });
    }
  });
}

export async function addNote(userId: string, id: string, body: string): Promise<void> {
  await withUser(userId, (tx) => tx.note.create({ data: { userId, applicationId: id, body } }));
}

export async function regenerate(userId: string, id: string, note?: string | null): Promise<void> {
  const manual = provider() === "manual";
  await withUser(userId, (tx) =>
    tx.application.update({
      where: { id },
      data: { generationStatus: manual ? "WAITING" : "QUEUED", generationError: null, regenerateNote: note ?? null, pendingSelection: Prisma.DbNull },
    }),
  );
  if (!manual) await enqueueGeneration({ applicationId: id, userId, note });
}

// ---------------------------------------------------------------------------
// Manual provider: the user carries the prompt to the model and the reply back.
// ---------------------------------------------------------------------------

async function loadBankFor(tx: Tx, userId: string): Promise<Bank | null> {
  const profile = await tx.profile.findFirst({ where: { userId } });
  if (!profile) return null;
  const entries = await tx.bankEntry.findMany({ where: { userId }, orderBy: { sortOrder: "asc" }, include: { bullets: { orderBy: { sortOrder: "asc" } } } });
  return BankSchema.parse({
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    links: profile.links,
    headline: profile.headline,
    summary: profile.summary,
    skillGroups: profile.skillGroups,
    education: profile.education,
    certifications: profile.certifications,
    entries: entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      organization: e.organization,
      title: e.title,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      url: e.url,
      bullets: e.bullets.map((b) => ({ id: b.id, text: b.text, skills: b.skills, metric: b.metric, inBase: b.inBase })),
    })),
  });
}

/** The prompt to paste into Claude for this application, or null if the application does not exist. */
export async function promptFor(userId: string, id: string): Promise<string | null> {
  return withUser(userId, async (tx) => {
    const app = await tx.application.findUnique({ where: { id }, include: { job: true } });
    if (!app) return null;
    const bank = await loadBankFor(tx, userId);
    if (!bank) throw new Error("Import your resume first.");
    return buildSelectionPrompt(bank, app.job.rawText, app.regenerateNote);
  });
}

/**
 * Accepts the pasted reply: validates it, stores the parsed posting on the
 * job and the selection on the application, then queues the worker, which
 * runs the rest of the pipeline (score, validate, render) from that selection.
 * Throws ManualReplyError with a sentence the user can act on.
 */
export async function submitReply(userId: string, id: string, text: string): Promise<void> {
  await withUser(userId, async (tx) => {
    const app = await tx.application.findUnique({ where: { id }, include: { job: true } });
    if (!app) throw new Error("Not found");
    const bank = await loadBankFor(tx, userId);
    if (!bank) throw new Error("Import your resume first.");
    const { parsed, selection } = parseSelectionReply(text, bank);
    await tx.job.update({
      where: { id: app.jobId },
      data: { parsed: parsed as unknown as Prisma.InputJsonValue, title: parsed.title || null, company: parsed.company || null },
    });
    await tx.application.update({
      where: { id },
      data: { pendingSelection: selection as unknown as Prisma.InputJsonValue, generationStatus: "QUEUED", generationError: null },
    });
  });
  await enqueueGeneration({ applicationId: id, userId });
}

export type BoardCard = {
  id: string;
  stage: Stage;
  title: string | null;
  company: string | null;
  fitVerdict: ApplicationView["fitVerdict"];
  generationStatus: ApplicationView["generationStatus"];
  daysInStage: number;
  /** An open follow-up reminder exists. */
  followUp: boolean;
};

export async function listBoard(userId: string): Promise<BoardCard[]> {
  return withUser(userId, async (tx) => {
    const apps = await tx.application.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: { job: true, stageEvents: { orderBy: { createdAt: "desc" }, take: 1 }, reminders: { where: { doneAt: null }, take: 1 } },
    });
    const now = Date.now();
    return apps.map((a) => ({
      id: a.id,
      stage: a.stage,
      title: a.job.title,
      company: a.job.company,
      fitVerdict: a.fitVerdict,
      generationStatus: a.generationStatus,
      daysInStage: Math.floor((now - (a.stageEvents[0]?.createdAt.getTime() ?? a.createdAt.getTime())) / 86_400_000),
      followUp: a.reminders.length > 0,
    }));
  });
}
