import type { Tag } from "@/lib/listings";

const TONE: Record<Tag["tone"], string> = { good: "var(--good)", warn: "var(--warn)", plain: "var(--ink-3)" };

/** Eligibility tags as dot and text. The colour says how sure the posting is, not how good the job is. */
export function ListingTags({ tags }: { tags: Tag[] }) {
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1">
      {tags.map((t) => (
        <span key={t.text} className="tag" style={{ "--tag-color": TONE[t.tone] } as React.CSSProperties} title={t.evidence ?? undefined}>
          {t.text}
        </span>
      ))}
    </span>
  );
}

/** The same tags with the posting's own words under each, for the detail page. */
export function ListingEvidence({ tags }: { tags: Tag[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-col gap-3">
      {tags.map((t) => (
        <li key={t.text}>
          <span className="tag tag-ink" style={{ "--tag-color": TONE[t.tone] } as React.CSSProperties}>
            {t.text}
          </span>
          {t.evidence && <blockquote className="mt-1 border-l border-hair-strong pl-3 text-[13px] leading-relaxed text-ink-2">{t.evidence}</blockquote>}
        </li>
      ))}
    </ul>
  );
}
