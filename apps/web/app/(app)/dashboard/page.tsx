import { STAGES, STAGE_LABEL, VERDICT_LABEL } from "@shortlisted/core";
import { requireUser } from "@/lib/session";
import { dashboardStats } from "@/lib/stats";
import { StageDot, STAGE_VAR } from "@/components/badges";

export const dynamic = "force-dynamic";

const VERDICTS = ["STRONG", "GOOD", "POSSIBLE", "POOR"] as const;

function weekLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function DashboardPage() {
  const user = await requireUser();
  const stats = await dashboardStats(user.id);
  const appliedTotal = stats.perWeek.reduce((n, w) => n + w.count, 0);
  const maxWeek = Math.max(1, ...stats.perWeek.map((w) => w.count));
  const sent = VERDICTS.reduce((n, v) => n + stats.byVerdict[v].applied, 0);
  const responded = VERDICTS.reduce((n, v) => n + stats.byVerdict[v].responded, 0);
  const inPlay = stats.perStage.APPLIED + stats.perStage.SCREENING + stats.perStage.INTERVIEW + stats.perStage.OFFER;
  const stageTotal = Math.max(1, stats.total);
  const lastIndex = stats.perWeek.length - 1;

  return (
    <div className="flex flex-col gap-10">
      <div className="enter">
        <h1 className="display text-[34px]">Dashboard</h1>
        <p className="mt-2 text-ink-2">The three numbers that say whether the search is working.</p>
      </div>

      <dl className="enter grid grid-cols-2 gap-x-8 gap-y-6 border-y border-hair py-6 sm:grid-cols-4" style={{ "--i": 1 } as React.CSSProperties}>
        <Big label="Captured" value={stats.total} sub="postings tailored" />
        <Big label="Applied, 8 weeks" value={appliedTotal} sub="applications sent" />
        <Big label="In play" value={inPlay} sub="applied through offer" />
        <Big label="Response rate" value={sent ? `${Math.round((responded / sent) * 100)}%` : "–"} sub={sent ? `${responded} of ${sent} got a conversation` : "nothing sent yet"} />
      </dl>

      <div className="grid gap-10 lg:grid-cols-3">
        <section className="enter" style={{ "--i": 2 } as React.CSSProperties}>
          <h2 className="label">Applied per week</h2>
          <div className="mt-5 flex h-32 items-end gap-1.5" role="img" aria-label={`Applications per week: ${stats.perWeek.map((w) => `${weekLabel(w.weekStart)} ${w.count}`).join(", ")}`}>
            {stats.perWeek.map((w, i) => (
              <div key={w.weekStart} className="flex h-full flex-1 flex-col justify-end" title={`${weekLabel(w.weekStart)}: ${w.count}`}>
                <div className="num mb-1 text-center text-[11px] text-ink-2">{w.count || ""}</div>
                <div className={`bar w-full ${i === lastIndex ? "bar-accent" : ""}`} style={{ height: `${Math.max(2, (w.count / maxWeek) * 100)}%`, "--i": i } as React.CSSProperties} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5 border-t border-hair pt-2">
            {stats.perWeek.map((w) => (
              <div key={w.weekStart} className="num flex-1 truncate text-center text-[10px] text-ink-3">
                {weekLabel(w.weekStart)}
              </div>
            ))}
          </div>
        </section>

        <section className="enter" style={{ "--i": 3 } as React.CSSProperties}>
          <h2 className="label">By stage</h2>
          <div className="mt-5 flex h-1.5 w-full overflow-hidden rounded-sm bg-surface-2" aria-hidden>
            {STAGES.map((s) =>
              stats.perStage[s] ? <span key={s} style={{ width: `${(stats.perStage[s] / stageTotal) * 100}%`, background: STAGE_VAR[s] }} /> : null,
            )}
          </div>
          <ul className="mt-4 flex flex-col">
            {STAGES.map((s) => (
              <li key={s} className="flex items-center justify-between border-b border-hair py-1.5 text-[13px] last:border-0">
                <span className="flex items-center gap-2 text-ink-2">
                  <StageDot stage={s} /> {STAGE_LABEL[s]}
                </span>
                <span className="num">{stats.perStage[s]}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="enter" style={{ "--i": 4 } as React.CSSProperties}>
          <h2 className="label">Response rate by fit</h2>
          <p className="hint">Of what you sent, how many reached a screening, interview or offer.</p>
          <ul className="mt-5 flex flex-col gap-4">
            {VERDICTS.map((v, i) => {
              const b = stats.byVerdict[v];
              return (
                <li key={v}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span>{VERDICT_LABEL[v]}</span>
                    {b.rate === null ? (
                      <span className="text-xs text-ink-3">none sent</span>
                    ) : (
                      <span className="num">
                        {Math.round(b.rate * 100)}%<span className="text-ink-3"> · {b.responded}/{b.applied}</span>
                      </span>
                    )}
                  </div>
                  <div className="progress mt-1.5" aria-hidden>
                    <span style={{ width: `${(b.rate ?? 0) * 100}%`, "--i": i } as React.CSSProperties} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Big({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="display mt-2 text-[40px]">{value}</dd>
      <dd className="mt-1 text-xs text-ink-3">{sub}</dd>
    </div>
  );
}
