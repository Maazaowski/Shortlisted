import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Bookmark, BookmarkCheck, EyeOff, FileText } from "lucide-react";
import { CAREER_FIELDS, daysSince, matchListing, ParsedJobSchema, provider, skillCovered, STALE_AFTER_DAYS } from "@shortlisted/core";
import { requireUser } from "@/lib/session";
import { getPreferences } from "@/lib/preferences";
import { eligibilityTags, getListing, matchContext } from "@/lib/listings";
import { tailorListingAction, toggleHiddenAction, toggleSavedAction } from "@/app/actions/listings";
import { ListingEvidence } from "@/components/listing-tags";
import { KeyRequirementsButton } from "@/components/key-requirements-button";

export const dynamic = "force-dynamic";

const FIELD_LABEL = new Map<string, string>(CAREER_FIELDS.map((f) => [f.id, f.label]));
const GULF = new Set(["SA", "AE", "QA", "BH", "KW", "OM"]);

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const [{ id }, { error }, { prefs }] = await Promise.all([params, searchParams, getPreferences(user.id)]);
  const l = await getListing(user.id, id);
  if (!l) notFound();

  const tags = eligibilityTags(l, prefs);
  const ctx = await matchContext(user.id, prefs);
  const match = ctx ? matchListing(ctx.skills, ctx.titles, l) : null;
  const read = l.parsed ? ParsedJobSchema.safeParse(l.parsed) : null;
  const parsed = read?.success ? read.data : null;
  const manual = provider() === "manual";
  const posted = l.postedAt ?? l.firstSeenAt;
  const age = daysSince(posted);
  const host = new URL(l.url).hostname.replace(/^www\./, "");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-7">
      <Link href="/jobs" className="enter flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft size={13} strokeWidth={1.75} /> Jobs
      </Link>

      <header className="enter">
        <p className="label">{l.company}</p>
        <h1 className="display mt-2 text-[34px] leading-tight">{l.title}</h1>
        <p className="num mt-3 text-xs text-ink-3">
          {[l.location, FIELD_LABEL.get(l.field), l.employmentType, age === 0 ? "Posted today" : `Posted ${age} ${age === 1 ? "day" : "days"} ago`].filter(Boolean).join(" · ")}
        </p>
      </header>

      {error && (
        <p className="callout callout-bad" role="alert">
          {error}
        </p>
      )}
      {l.closedAt && <p className="callout callout-warn">This role is no longer in the job list. The employer has probably closed it.</p>}
      {!l.closedAt && age > STALE_AFTER_DAYS && <p className="callout callout-warn">Posted over {STALE_AFTER_DAYS} days ago. It may already be filled. Check the company&apos;s page before spending time on it.</p>}
      {l.hiddenAt && <p className="callout">You hid this role. It does not appear in the lists.</p>}

      <div className="enter flex flex-wrap items-center gap-2" style={{ "--i": 1 } as React.CSSProperties}>
        <a href={l.url} target="_blank" rel="noreferrer" className="btn btn-primary">
          Apply on the company&apos;s page <ArrowUpRight size={14} strokeWidth={2} />
        </a>
        {l.applicationId ? (
          <Link href={`/applications/${l.applicationId}`} className="btn">
            <FileText size={14} strokeWidth={1.75} /> Open your application
          </Link>
        ) : (
          <form action={tailorListingAction}>
            <input type="hidden" name="id" value={l.id} />
            <button className="btn">
              <FileText size={14} strokeWidth={1.75} /> Tailor my resume
            </button>
          </form>
        )}
        <form action={toggleSavedAction}>
          <input type="hidden" name="id" value={l.id} />
          <button className="btn btn-ghost" aria-pressed={Boolean(l.savedAt)}>
            {l.savedAt ? <BookmarkCheck size={14} strokeWidth={1.75} /> : <Bookmark size={14} strokeWidth={1.75} />} {l.savedAt ? "Saved" : "Save for later"}
          </button>
        </form>
        <form action={toggleHiddenAction}>
          <input type="hidden" name="id" value={l.id} />
          <button className="btn btn-ghost">
            <EyeOff size={14} strokeWidth={1.75} /> {l.hiddenAt ? "Show again" : "Hide"}
          </button>
        </form>
      </div>
      <p className="-mt-4 text-xs text-ink-3">
        Opens <span className="num">{host}</span>, the employer&apos;s own posting. Tailoring builds a resume and cover letter for this role from your bank.
      </p>

      <section className="enter" style={{ "--i": 2 } as React.CSSProperties}>
        <h2 className="label">What the posting says</h2>
        <p className="mt-1 text-[13px] text-ink-3">Worked out by rules from the posting&apos;s own words, shown under each line. Nobody has checked this role by hand.</p>
        <div className="mt-4">
          {tags.length ? <ListingEvidence tags={tags} /> : <p className="text-[14px] text-ink-2">The posting says nothing the rules could read about where you can work from or about visas.</p>}
        </div>
        {l.countries.some((c) => GULF.has(c)) && <p className="mt-4 text-[13px] text-ink-2">A real employer does not charge you a fee to apply, to interview or to be hired. Walk away from anyone who asks for one.</p>}
      </section>

      <section>
        <h2 className="label">Key requirements</h2>
        {parsed ? (
          <div className="mt-3 flex flex-col gap-5">
            <p className="text-[13px] text-ink-3">
              Read from the posting by the model.{ctx ? " A green dot means your bank names the skill." : ""}
              {parsed.yearsExperience != null ? ` Asks for ${parsed.yearsExperience} ${parsed.yearsExperience === 1 ? "year" : "years"} of experience.` : ""}
            </p>
            <Requirements title="Must have" skills={parsed.mustHaveSkills} bank={ctx?.skills ?? null} />
            <Requirements title="Nice to have" skills={parsed.niceToHaveSkills} bank={ctx?.skills ?? null} />
            {parsed.mustHaveSkills.length === 0 && parsed.niceToHaveSkills.length === 0 && <p className="text-[14px] text-ink-2">The posting does not name specific skills.</p>}
          </div>
        ) : manual ? (
          <p className="mt-2 text-[13px] text-ink-2">Must-have and nice-to-have skills are read when you tailor your resume. Below is what a word list found in the posting.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-[13px] text-ink-2">Sorts what the posting asks for into must-have and nice-to-have. One request to your model. Tailoring reuses it.</p>
            <KeyRequirementsButton id={l.id} />
          </div>
        )}
      </section>

      {l.skills.length > 0 && (
        <section>
          <h2 className="label">Skills named in the posting</h2>
          <p className="mt-1 text-[13px] text-ink-3">Found by a fixed word list, so some may be missing.</p>
          {match ? (
            <div className="mt-3 flex flex-col gap-4">
              <SkillRow title={`In your bank, ${match.shown.length} of ${l.skills.length}`} skills={match.shown} have />
              <SkillRow title="Not in your bank" skills={match.missing} />
            </div>
          ) : (
            <div className="mt-3">
              <SkillRow skills={l.skills} />
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="label">The posting</h2>
        <div className="mt-3 whitespace-pre-line text-[14.5px] leading-relaxed text-ink">{l.description}</div>
        <p className="mt-4 text-xs text-ink-3">
          Long postings are shortened here.{" "}
          <a href={l.url} target="_blank" rel="noreferrer" className="underline">
            Read it in full on {host}
          </a>
        </p>
      </section>
    </div>
  );
}

function SkillRow({ title, skills, have = false }: { title?: string; skills: string[]; have?: boolean }) {
  if (skills.length === 0) return null;
  return (
    <div>
      {title && <p className="num mb-2 text-[11px] text-ink-3">{title}</p>}
      <div className="flex flex-wrap gap-1.5">
        {skills.map((s) => (
          <span key={s} className={`chip ${have ? "!border-hair-strong !text-ink" : ""}`}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One requirement per line, each marked by whether the bank names it. With no bank, a plain list. */
function Requirements({ title, skills, bank }: { title: string; skills: string[]; bank: Set<string> | null }) {
  const list = skills.filter((s) => s.trim());
  if (list.length === 0) return null;
  const covered = bank ? list.filter((s) => skillCovered(s, bank)).length : 0;
  return (
    <div>
      <p className="num mb-2 text-[11px] text-ink-3">
        {title}
        {bank ? `, ${covered} of ${list.length} in your bank` : ""}
      </p>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {list.map((s) => {
          const has = bank ? skillCovered(s, bank) : false;
          return (
            <li key={s} className={`tag ${has ? "tag-ink" : ""}`} style={{ "--tag-color": has ? "var(--good)" : "var(--hair-strong)" } as React.CSSProperties}>
              {s}
              {bank && <span className="sr-only">{has ? ", in your bank" : ", not in your bank"}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
