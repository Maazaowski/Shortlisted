import Link from "next/link";
import { CAREER_FIELDS, COUNTRIES, POOLS } from "@shortlisted/core";
import { requireUser } from "@/lib/session";
import { getPreferences } from "@/lib/preferences";
import { newerRelease, VERSION } from "@/lib/version";
import { savePreferencesAction } from "@/app/actions/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; next?: string }>;
}) {
  const user = await requireUser();
  const [{ prefs }, query, update] = await Promise.all([
    getPreferences(user.id),
    searchParams,
    newerRelease(),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="enter">
        <h1 className="display text-[34px]">Settings</h1>
        <p className="mt-2 text-ink-2">
          Where you are and what you are looking for. This decides which roles
          you are shown. It stays on this machine.
        </p>
      </div>

      {query.saved && (
        <p className="callout callout-good enter" role="status">
          Settings saved.
        </p>
      )}
      {query.error && (
        <p className="callout callout-bad enter" role="alert">
          {query.error}
        </p>
      )}
      {update && (
        <p className="callout callout-accent enter">
          <span>
            Version {update.tag} is available. You are on {VERSION}. In the
            Shortlisted folder, run{" "}
            <code className="num">docker compose pull</code> and then{" "}
            <code className="num">docker compose up -d</code>.{" "}
            <a
              href={update.url}
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              What changed
            </a>
          </span>
        </p>
      )}

      <form
        action={savePreferencesAction}
        className="enter flex flex-col gap-8"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        {query.next === "setup" && (
          <input type="hidden" name="next" value="setup" />
        )}

        <section className="flex flex-col gap-4">
          <h2 className="label">Where you are</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Country you live in</span>
              <select
                name="homeCountry"
                defaultValue={prefs.homeCountry}
                className="field"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="hint">
                Remote roles are checked against this country.
              </span>
            </label>
            <label className="block">
              <span className="field-label">Passport</span>
              <select
                name="citizenship"
                defaultValue={prefs.citizenship}
                className="field"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="hint">
                Decides where you would need a sponsored visa.
              </span>
            </label>
          </div>
        </section>

        <fieldset className="flex flex-col gap-3">
          <legend className="label">Pools</legend>
          {POOLS.map((p) => (
            <label key={p.id} className="flex items-start gap-3">
              <input
                type="checkbox"
                name="pools"
                value={p.id}
                defaultChecked={prefs.pools.includes(p.id)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{p.label}</span>
                <span className="block text-[13px] text-ink-2">
                  {p.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="label">Career fields</legend>
          <p className="text-[13px] text-ink-2">
            Tick the ones you want. Leave all unticked to see every field.
          </p>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {CAREER_FIELDS.map((f) => (
              <label
                key={f.id}
                className="flex items-center gap-2.5 text-[14px]"
              >
                <input
                  type="checkbox"
                  name="fields"
                  value={f.id}
                  defaultChecked={prefs.fields.includes(f.id)}
                />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>

        <section className="flex flex-col gap-4">
          <h2 className="label">What you are aiming for</h2>
          <label className="block">
            <span className="field-label">Job titles</span>
            <textarea
              name="targetTitles"
              defaultValue={prefs.targetTitles.join("\n")}
              className="field"
              rows={4}
              placeholder={"Backend Engineer\nPlatform Engineer"}
            />
            <span className="hint">
              One per line, up to twelve. Roles with these titles rank higher.
            </span>
          </label>
          <label className="block max-w-xs">
            <span className="field-label">Applications per week</span>
            <input
              name="weeklyGoal"
              type="number"
              min={1}
              max={200}
              defaultValue={prefs.weeklyGoal ?? ""}
              className="field"
              placeholder="No goal"
            />
            <span className="hint">
              Optional. The dashboard shows this week against it.
            </span>
          </label>
        </section>

        <details className="group">
          <summary className="label cursor-pointer list-none !text-ink-2 hover:!text-ink">
            Advanced
          </summary>
          <label className="mt-4 block">
            <span className="field-label">Job feed address</span>
            <input
              name="feedUrl"
              type="url"
              defaultValue={prefs.feedUrl ?? ""}
              className="field"
              placeholder="Leave blank for the default feed"
            />
            <span className="hint">
              Only change this if you build your own feed from a fork.
            </span>
          </label>
        </details>

        <div className="flex items-center gap-4 border-t border-hair pt-5">
          <button className="btn btn-primary">Save settings</button>
          <Link
            href="/setup"
            className="text-[13px] text-ink-2 underline hover:text-ink"
          >
            Setup checklist
          </Link>
          <span className="num ml-auto text-xs text-ink-3">
            Version {VERSION}
          </span>
        </div>
      </form>

      <section className="border-t border-hair pt-6">
        <h2 className="label">Your data</h2>
        <p className="mt-2 text-[13.5px] text-ink-2">
          The only copy is on this machine. Download it before you reinstall, move to another computer, or run docker compose down -v.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href="/api/export" className="btn btn-sm" download>
            Everything as JSON
          </a>
          <a href="/api/export?format=csv" className="btn btn-sm" download>
            Applications as a spreadsheet (CSV)
          </a>
        </div>
        <p className="hint">The JSON holds your bank, applications, notes, selections and saved roles. PDFs are not included.</p>
      </section>
    </div>
  );
}
