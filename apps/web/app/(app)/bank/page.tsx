import Link from "next/link";
import { ArrowRight, ChevronDown, Plus, Trash2, Upload } from "lucide-react";
import { withUser } from "@shortlisted/db";
import { requireUser } from "@/lib/session";
import {
  addBulletAction,
  addEntryAction,
  deleteBulletAction,
  deleteEntryAction,
  updateBulletAction,
  updateProfileAction,
} from "@/app/actions/bank";

export const dynamic = "force-dynamic";

export default async function BankPage() {
  const user = await requireUser();
  const data = await withUser(user.id, async (tx) => ({
    profile: await tx.profile.findUnique({ where: { userId: user.id } }),
    entries: await tx.bankEntry.findMany({ where: { userId: user.id }, orderBy: { sortOrder: "asc" }, include: { bullets: { orderBy: { sortOrder: "asc" } } } }),
  }));

  if (!data.profile) {
    return (
      <div className="card enter max-w-md">
        <h1 className="display text-[24px]">No bank yet</h1>
        <p className="mt-2 text-ink-2">Import your current resume and every bullet becomes an entry you can refine.</p>
        <Link href="/onboarding" className="btn btn-primary mt-4">
          Import your resume <ArrowRight size={14} strokeWidth={2} />
        </Link>
      </div>
    );
  }
  const p = data.profile;
  const bulletCount = data.entries.reduce((n, e) => n + e.bullets.length, 0);
  const withMetric = data.entries.reduce((n, e) => n + e.bullets.filter((b) => b.metric).length, 0);
  const ratio = bulletCount ? withMetric / bulletCount : 0;
  const links = (p.links as { url: string }[]).map((l) => l.url).join("\n");
  const skillGroups = (p.skillGroups as { name: string; skills: string[] }[]).map((g) => `${g.name}: ${g.skills.join(", ")}`).join("\n");

  return (
    <div className="flex flex-col gap-8">
      <div className="enter flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[34px]">Experience bank</h1>
          <p className="mt-2 max-w-2xl text-ink-2">The only source the model may draw from. Everything on a tailored resume traces back to a bullet here.</p>
        </div>
        <Link href="/onboarding" className="btn">
          <Upload size={14} strokeWidth={1.75} /> Import a resume
        </Link>
      </div>

      <div className="grid gap-10 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start">
          <section className="enter" style={{ "--i": 1 } as React.CSSProperties}>
            <h2 className="label">Bank health</h2>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="display text-[36px]">{bulletCount}</span>
              <span className="text-ink-2">bullets</span>
            </div>
            <div className="progress mt-3" aria-hidden>
              <span style={{ width: `${ratio * 100}%` }} />
            </div>
            <p className="mt-2 text-[13px] text-ink-2">
              <span className="num text-ink">{withMetric}</span> carry a number. Those are the ones the model reaches for first.
            </p>
          </section>

          <details className="card group enter" open style={{ "--i": 2 } as React.CSSProperties}>
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="label !text-ink">Profile</span>
              <ChevronDown size={14} strokeWidth={1.75} className="text-ink-3 transition-transform group-open:rotate-180" />
            </summary>
            <form action={updateProfileAction} className="mt-4 flex flex-col gap-3">
              <Field label="Full name" name="fullName" defaultValue={p.fullName} required />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email" name="email" defaultValue={p.email} required />
                <Field label="Phone" name="phone" defaultValue={p.phone ?? ""} />
              </div>
              <Field label="Location" name="location" defaultValue={p.location ?? ""} />
              <Field label="Base headline" name="headline" defaultValue={p.headline} required hint="Under your name on the untailored resume." />
              <label>
                <span className="field-label">Base summary</span>
                <textarea name="summary" defaultValue={p.summary} className="field" rows={4} required />
              </label>
              <label>
                <span className="field-label">Links</span>
                <textarea name="links" defaultValue={links} className="field" rows={3} placeholder="https://github.com/you" />
                <span className="hint">One per line.</span>
              </label>
              <label>
                <span className="field-label">Skill groups</span>
                <textarea name="skillGroups" defaultValue={skillGroups} className="field" rows={4} placeholder="Backend: node, postgres, prisma" />
                <span className="hint">One group per line as Name: skill, skill.</span>
              </label>
              <Field label="File name format" name="fileNameFormat" defaultValue={p.fileNameFormat} hint="Tokens: {name} {title} {company}" />
              <button className="btn btn-primary mt-1">Save profile</button>
            </form>
          </details>

          <details className="card group enter" style={{ "--i": 3 } as React.CSSProperties}>
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="label !text-ink">Add a role or project</span>
              <Plus size={14} strokeWidth={1.75} className="text-ink-3 transition-transform group-open:rotate-45" />
            </summary>
            <form action={addEntryAction} className="mt-4 flex flex-col gap-3">
              <label>
                <span className="field-label">Kind</span>
                <select name="kind" className="field">
                  <option value="ROLE">Role</option>
                  <option value="PROJECT">Project</option>
                </select>
              </label>
              <Field label="Company or project name" name="organization" required />
              <Field label="Title" name="title" required />
              <Field label="Location" name="location" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start" name="startDate" placeholder="YYYY-MM" />
                <Field label="End" name="endDate" placeholder="YYYY-MM or blank" />
              </div>
              <Field label="URL" name="url" placeholder="https://" />
              <button className="btn">Add</button>
            </form>
          </details>
        </aside>

        <div className="flex flex-col gap-8">
          {data.entries.length === 0 && <p className="enter text-ink-2">No roles or projects yet. Add one on the left.</p>}
          {data.entries.map((e, ei) => (
            <section key={e.id} className="enter" style={{ "--i": ei + 2 } as React.CSSProperties}>
              <div className="flex items-start justify-between gap-3 border-b border-hair pb-3">
                <div className="min-w-0">
                  <h2 className="text-[17px] font-medium">
                    {e.title} <span className="text-ink-2">at {e.organization}</span>
                  </h2>
                  <p className="num mt-0.5 text-xs text-ink-3">
                    {e.kind === "PROJECT" ? "Project" : "Role"}
                    {e.location ? ` · ${e.location}` : ""} · {e.startDate ?? "?"} to {e.endDate ?? "present"}
                  </p>
                </div>
                <form action={deleteEntryAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <button className="btn btn-ghost btn-sm btn-danger" aria-label={`Delete ${e.title}`}>
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </form>
              </div>

              <ul className="mt-2 flex flex-col divide-y divide-hair">
                {e.bullets.map((b) => (
                  <li key={b.id} className="py-3">
                    <form action={updateBulletAction} className="flex flex-col gap-2">
                      <input type="hidden" name="id" value={b.id} />
                      <textarea name="text" defaultValue={b.text} className="field" rows={2} required aria-label="Bullet text" />
                      <div className="flex flex-wrap items-center gap-2">
                        <input name="skills" defaultValue={b.skills.join(", ")} className="field min-w-40 flex-1" placeholder="skills, comma separated" aria-label="Skills" />
                        <input name="metric" defaultValue={b.metric ?? ""} className="field w-32" placeholder="metric" aria-label="Metric" />
                        <label className="flex h-9 items-center gap-1.5 text-xs text-ink-2">
                          <input type="checkbox" name="inBase" defaultChecked={b.inBase} /> base
                        </label>
                        <div className="ml-auto flex gap-1">
                          <button className="btn btn-sm">Save</button>
                          <button formAction={deleteBulletAction} className="btn btn-sm btn-ghost btn-danger" aria-label="Delete bullet">
                            <Trash2 size={13} strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                    </form>
                  </li>
                ))}
              </ul>

              <form action={addBulletAction} className="mt-2 flex flex-col gap-2 rounded-[var(--radius)] border border-dashed border-hair-strong p-3">
                <input type="hidden" name="entryId" value={e.id} />
                <textarea name="text" className="field" rows={2} placeholder="New achievement. Lead with the outcome and include the number." required aria-label="New bullet text" />
                <div className="flex flex-wrap items-center gap-2">
                  <input name="skills" className="field min-w-40 flex-1" placeholder="skills, comma separated" aria-label="Skills" />
                  <input name="metric" className="field w-32" placeholder="metric" aria-label="Metric" />
                  <label className="flex h-9 items-center gap-1.5 text-xs text-ink-2">
                    <input type="checkbox" name="inBase" /> base
                  </label>
                  <button className="btn btn-sm ml-auto">
                    <Plus size={13} strokeWidth={2} /> Add bullet
                  </button>
                </div>
              </form>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, name, defaultValue, required, placeholder, hint }: { label: string; name: string; defaultValue?: string; required?: boolean; placeholder?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input name={name} defaultValue={defaultValue} className="field" required={required} placeholder={placeholder} />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}
