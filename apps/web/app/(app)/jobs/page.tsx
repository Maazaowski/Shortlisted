import Link from "next/link";
import { Bookmark, BookmarkCheck, EyeOff, RefreshCw } from "lucide-react";
import { CAREER_FIELDS, countryName, daysSince, matchListing, POOLS, STALE_AFTER_DAYS } from "@shortlisted/core";
import { requireUser } from "@/lib/session";
import { getPreferences } from "@/lib/preferences";
import { eligibilityTags, feedStatus, listJobs, matchContext, parseJobsQuery, type JobsQuery, type ListingRow, type MatchContext } from "@/lib/listings";
import { refreshFeedAction, toggleHiddenAction, toggleSavedAction } from "@/app/actions/listings";
import { ListingTags } from "@/components/listing-tags";

export const dynamic = "force-dynamic";

const FIELD_LABEL = new Map<string, string>(CAREER_FIELDS.map((f) => [f.id, f.label]));

function href(query: JobsQuery, change: Partial<JobsQuery>): string {
  const q = { ...query, ...change };
  const params = new URLSearchParams();
  params.set("pool", q.pool);
  if (q.q) params.set("q", q.q);
  if (q.field) params.set("field", q.field);
  if (q.tech) params.set("tech", "1");
  if (q.recent) params.set("recent", "1");
  if (q.unclear) params.set("unclear", "1");
  if (q.saved) params.set("saved", "1");
  if (q.sort === "match") params.set("sort", "match");
  if (q.page > 1) params.set("page", String(q.page));
  return `/jobs?${params.toString()}`;
}

function ago(date: Date): string {
  const days = daysSince(date);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const [{ prefs }, params] = await Promise.all([getPreferences(user.id), searchParams]);
  const query = parseJobsQuery(params, prefs);
  const ctx = await matchContext(user.id, prefs);
  const [status, page] = await Promise.all([feedStatus(user.id), listJobs(user.id, query, prefs, ctx)]);
  const byMatch = query.sort === "match" && ctx !== null;
  const pools = POOLS.filter((p) => prefs.pools.includes(p.id));
  const home = countryName(prefs.homeCountry);

  return (
    <div className="flex flex-col gap-7">
      <div className="enter flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[34px]">Jobs</h1>
          <p className="mt-2 max-w-2xl text-ink-2">
            Open roles from company job boards. Each one is screened by rules, not by people, so every tag shows the posting&apos;s own words. You apply on the company&apos;s page.
          </p>
        </div>
        <dl className="flex gap-8">
          <Stat label="Open roles" value={page.counts.roles} />
          <Stat label="Companies" value={page.counts.companies} />
          <Stat label="Fields" value={page.counts.fields} />
        </dl>
      </div>

      {status.lastError && (
        <p className="callout callout-warn enter" role="status">
          {status.lastError} {status.hasListings ? "The listings below are from the last successful check." : ""}
        </p>
      )}

      <nav aria-label="Pools" className="enter flex flex-wrap items-center gap-1 border-b border-hair" style={{ "--i": 1 } as React.CSSProperties}>
        {pools.map((p) => {
          const active = p.id === query.pool;
          return (
            <Link
              key={p.id}
              href={href(query, { pool: p.id, page: 1 })}
              aria-current={active ? "page" : undefined}
              className={`relative -mb-px flex h-10 items-center px-3 text-[14px] ${active ? "border-b border-ink font-medium text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {p.label}
            </Link>
          );
        })}
        <Link href={href(query, { saved: !query.saved, page: 1 })} className={`ml-auto flex h-10 items-center gap-1.5 px-2 text-[13px] ${query.saved ? "font-medium text-ink" : "text-ink-2 hover:text-ink"}`}>
          {query.saved ? <BookmarkCheck size={14} strokeWidth={1.75} /> : <Bookmark size={14} strokeWidth={1.75} />} Saved only
        </Link>
      </nav>

      <form action="/jobs" className="enter flex flex-wrap items-end gap-3" style={{ "--i": 2 } as React.CSSProperties}>
        <input type="hidden" name="pool" value={query.pool} />
        {query.saved && <input type="hidden" name="saved" value="1" />}
        <label className="min-w-52 flex-1">
          <span className="field-label">Search</span>
          <input name="q" defaultValue={query.q} className="field" placeholder="Title, company or a word in the posting" />
        </label>
        <label className="w-56">
          <span className="field-label">Career field</span>
          <select name="field" defaultValue={query.field} className="field">
            <option value="">{prefs.fields.length ? "My fields" : "All fields"}</option>
            {prefs.fields.length > 0 && <option value="any">All fields</option>}
            {CAREER_FIELDS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        {ctx && (
          <label className="w-40">
            <span className="field-label">Order</span>
            <select name="sort" defaultValue={query.sort} className="field">
              <option value="new">Newest first</option>
              <option value="match">Best match first</option>
            </select>
          </label>
        )}
        <div className="flex h-9 items-center gap-4 text-[13px] text-ink-2">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="tech" value="1" defaultChecked={query.tech} /> Tech only
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="recent" value="1" defaultChecked={query.recent} /> Last 30 days
          </label>
          {query.pool === "remote" && (
            <label className="flex items-center gap-1.5" title="Roles marked Remote that do not say which countries they hire in.">
              <input type="checkbox" name="unclear" value="1" defaultChecked={query.unclear} /> Include unclear
            </label>
          )}
        </div>
        <button className="btn">Filter</button>
      </form>

      <p className="text-[13px] text-ink-2">
        <PoolLine pool={query.pool} home={home} unclear={query.unclear} /> <span className="num text-ink">{page.total}</span> {page.total === 1 ? "role matches" : "roles match"}.
        {byMatch && " Ordered by how many of the skills each posting names are in your bank, and by your target titles. A rough guide: the skills are found by a fixed word list."}
        {!ctx && (
          <>
            {" "}
            <Link href="/onboarding" className="underline">
              Import your resume
            </Link>{" "}
            to see which roles match it.
          </>
        )}
      </p>

      {page.rows.length === 0 ? (
        <Empty hasListings={status.hasListings} error={status.lastError} />
      ) : (
        <ul className="flex flex-col divide-y divide-hair border-y border-hair">
          {page.rows.map((l, i) => (
            <Row key={l.id} listing={l} index={i} tags={eligibilityTags(l, prefs)} ctx={ctx} isNew={status.newSince !== null && l.createdAt > status.newSince} />
          ))}
        </ul>
      )}

      {page.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-[13px]">
          {query.page > 1 ? (
            <Link href={href(query, { page: query.page - 1 })} className="btn btn-sm">
              {byMatch ? "Previous" : "Newer"}
            </Link>
          ) : (
            <span />
          )}
          <span className="num text-ink-3">
            Page {query.page} of {page.pages}
          </span>
          {query.page < page.pages ? (
            <Link href={href(query, { page: query.page + 1 })} className="btn btn-sm">
              {byMatch ? "Next" : "Older"}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hair pt-4 text-xs text-ink-3">
        <span>
          {status.builtAt ? `Job list built ${ago(status.builtAt)}.` : "No job list downloaded yet."} {status.syncedAt ? `Checked ${ago(status.syncedAt)}.` : ""}
        </span>
        <form action={refreshFeedAction}>
          <button className="btn btn-ghost btn-sm">
            <RefreshCw size={12} strokeWidth={1.75} /> Check now
          </button>
        </form>
        {status.attribution.map((a) => (
          <a key={a.source} href={a.url} target="_blank" rel="noreferrer" className="underline">
            {a.name}
          </a>
        ))}
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="num mt-1 text-[26px] leading-none">{value.toLocaleString("en-GB")}</dd>
    </div>
  );
}

function PoolLine({ pool, home, unclear }: { pool: string; home: string; unclear: boolean }) {
  if (pool === "remote") return <>Remote roles whose posting admits someone living in {home}{unclear ? ", plus roles that do not say where they hire" : ""}.</>;
  if (pool === "relocate") return <>Roles abroad whose posting states visa sponsorship or relocation support, or whose employer is a licensed sponsor.</>;
  if (pool === "gulf") return <>Office roles in Saudi Arabia, the UAE, Qatar, Bahrain, Kuwait and Oman. A real employer does not charge you a fee to apply or to be hired.</>;
  return null;
}

function Row({ listing: l, index, tags, ctx, isNew }: { listing: ListingRow; index: number; tags: ReturnType<typeof eligibilityTags>; ctx: MatchContext | null; isNew: boolean }) {
  const posted = l.postedAt ?? l.firstSeenAt;
  const match = ctx && l.skills.length > 0 ? matchListing(ctx.skills, ctx.titles, l) : null;
  const stale = daysSince(posted) > STALE_AFTER_DAYS;
  return (
    <li className="enter flex items-start gap-4 py-4" style={{ "--i": Math.min(index, 12) } as React.CSSProperties}>
      <div className="min-w-0 flex-1">
        <Link href={`/jobs/${l.id}`} className="group block">
          <span className="text-[15px] font-medium leading-snug group-hover:underline">{l.title}</span>
          <span className="mt-0.5 block text-[13px] text-ink-2">
            {l.company}
            {l.location ? ` · ${l.location}` : ""}
          </span>
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <ListingTags tags={tags} />
          <span className="num text-[11px] text-ink-3">{FIELD_LABEL.get(l.field) ?? l.field}</span>
          {match && (
            <span className="num text-[11px] text-ink-3" title={match.missing.length ? `Not in your bank: ${match.missing.join(", ")}` : "Every skill the posting names is in your bank."}>
              <span className={match.shown.length ? "text-ink" : ""}>{match.shown.length}</span> of {l.skills.length} skills in your bank
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="num text-[11px] text-ink-3">
          {isNew && <span className="mr-2 font-medium text-accent">New</span>}
          {stale ? <span title="Posted over 45 days ago. It may already be filled.">{ago(posted)}, may be stale</span> : ago(posted)}
        </span>
        <div className="flex items-center gap-1">
          {l.applicationId && (
            <Link href={`/applications/${l.applicationId}`} className="btn btn-sm">
              Application
            </Link>
          )}
          <form action={toggleSavedAction}>
            <input type="hidden" name="id" value={l.id} />
            <button className="btn btn-ghost btn-sm" aria-label={l.savedAt ? `Remove ${l.title} from saved` : `Save ${l.title} for later`} aria-pressed={Boolean(l.savedAt)}>
              {l.savedAt ? <BookmarkCheck size={14} strokeWidth={1.75} /> : <Bookmark size={14} strokeWidth={1.75} />}
            </button>
          </form>
          <form action={toggleHiddenAction}>
            <input type="hidden" name="id" value={l.id} />
            <button className="btn btn-ghost btn-sm" aria-label={`Hide ${l.title}`}>
              <EyeOff size={14} strokeWidth={1.75} />
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}

function Empty({ hasListings, error }: { hasListings: boolean; error: string | null }) {
  if (!hasListings) {
    return (
      <div className="card max-w-lg">
        <h2 className="display text-[22px]">{error ? "No job list yet" : "Downloading the job list"}</h2>
        <p className="mt-2 text-ink-2">{error ? "The list could not be downloaded. The reason is above. Use Check now to try again." : "This takes under a minute the first time. Refresh the page shortly."}</p>
      </div>
    );
  }
  return (
    <div className="card max-w-lg">
      <h2 className="display text-[22px]">Nothing matches</h2>
      <p className="mt-2 text-ink-2">Loosen a filter, or try another pool. Roles marked Remote that do not say where they hire are under Include unclear.</p>
    </div>
  );
}
