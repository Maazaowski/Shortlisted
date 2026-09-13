import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { STAGES, STAGE_LABEL } from "@shortlisted/core";
import { requireUser } from "@/lib/session";
import { listBoard, type BoardCard } from "@/lib/applications";
import { listOpenReminders, syncReminders } from "@/lib/reminders";
import { markReminderDoneAction } from "@/app/actions/reminders";
import { StageDot, VerdictTag } from "@/components/badges";
import { withUser } from "@shortlisted/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const user = await requireUser();
  const profile = await withUser(user.id, (tx) => tx.profile.findFirst({ where: { userId: user.id } }));
  if (!profile) redirect("/onboarding");
  await syncReminders(user.id);
  const [cards, reminders] = await Promise.all([listBoard(user.id), listOpenReminders(user.id)]);

  const movedThisWeek = cards.filter((c) => c.stage !== "SAVED" && c.stage !== "GENERATED" && c.daysInStage <= 7).length;
  const active = cards.filter((c) => c.stage !== "REJECTED" && c.stage !== "WITHDRAWN").length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="enter">
          <h1 className="display text-[34px]">Board</h1>
          <p className="mt-2 text-ink-2">One column per stage. Open a card for the documents you sent.</p>
        </div>
        <dl className="enter flex gap-8" style={{ "--i": 1 } as React.CSSProperties}>
          <Stat label="Active" value={active} />
          <Stat label="Moved, 7 days" value={movedThisWeek} />
          <Stat label="Follow-ups" value={reminders.length} accent={reminders.length > 0} />
        </dl>
      </div>

      {reminders.length > 0 && (
        <section className="enter" style={{ "--i": 2 } as React.CSSProperties}>
          <h2 className="label mb-2">Follow up</h2>
          <ul className="card flex flex-col divide-y divide-hair !p-0">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 text-[13px]">
                  <Link href={`/applications/${r.applicationId}`} className="font-medium hover:underline">
                    {r.title ?? "Untitled posting"}
                  </Link>
                  <span className="text-ink-2">
                    {r.company ? ` · ${r.company}` : ""} · quiet for {r.quietDays} days
                  </span>
                </div>
                <form action={markReminderDoneAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn btn-sm" type="submit">
                    <Check size={13} strokeWidth={2} /> Done
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cards.length === 0 ? (
        <EmptyBoard />
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 sm:-mx-8 sm:px-8">
          <div className="flex min-w-[1280px]">
            {STAGES.map((stage, si) => {
              const col = cards.filter((c) => c.stage === stage);
              return (
                <section key={stage} className="column enter flex-1" style={{ "--i": si + 2 } as React.CSSProperties} aria-label={STAGE_LABEL[stage]}>
                  <h2 className="label flex items-center gap-2 pb-3">
                    <StageDot stage={stage} />
                    {STAGE_LABEL[stage]}
                    <span className="num ml-auto text-ink-3">{col.length}</span>
                  </h2>
                  <div className="flex flex-col gap-2">
                    {col.length === 0 && <div className="column-empty">Empty</div>}
                    {col.map((c) => (
                      <Card key={c.id} card={c} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className={`num mt-1 text-[26px] leading-none ${accent ? "text-accent" : ""}`}>{value}</dd>
    </div>
  );
}

function Card({ card: c }: { card: BoardCard }) {
  const generating = c.generationStatus === "QUEUED" || c.generationStatus === "RUNNING";
  return (
    <Link href={`/applications/${c.id}`} className="card card-link block !p-3" aria-label={`${c.title ?? "Untitled"} at ${c.company ?? "unknown company"}`}>
      {generating && !c.title ? (
        <div className="flex flex-col gap-2 py-0.5">
          <div className="skeleton h-3 w-4/5" />
          <div className="skeleton h-3 w-2/5" />
        </div>
      ) : (
        <>
          <div className="truncate text-[13px] font-medium leading-snug">{c.title ?? "Reading posting"}</div>
          <div className="truncate text-xs text-ink-2">{c.company ?? "\u00a0"}</div>
        </>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <VerdictTag verdict={c.fitVerdict} />
        <span className="num text-[11px] text-ink-3">{c.daysInStage}d</span>
      </div>
      {c.followUp && <div className="mt-1.5 text-[11px] font-medium text-warn">Follow up</div>}
      {c.generationStatus === "WAITING" && <div className="mt-1.5 text-[11px] font-medium text-accent">Needs your reply</div>}
      {c.generationStatus === "FAILED" && <div className="mt-1.5 text-[11px] font-medium text-bad">Generation failed</div>}
      {generating && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-2">
          <span className="pulse" /> Generating
        </div>
      )}
    </Link>
  );
}

function EmptyBoard() {
  return (
    <div className="card enter max-w-lg" style={{ "--i": 2 } as React.CSSProperties}>
      <h2 className="display text-[24px]">Nothing captured yet</h2>
      <p className="mt-2 text-ink-2">Open a job posting and click the Shortlisted icon in Chrome, or paste a posting to see the first tailored resume.</p>
      <Link href="/generate" className="btn btn-primary mt-5">
        Paste a posting <ArrowRight size={14} strokeWidth={2} />
      </Link>
    </div>
  );
}
