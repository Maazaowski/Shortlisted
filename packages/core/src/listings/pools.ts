import { FeedListingSchema, type FeedListing } from "./feed.js";
import { REGIONS, WORLD } from "./places.js";
import type { RemoteScope } from "./remote.js";

/** Where installs download the feed from unless Settings says otherwise. */
export const DEFAULT_FEED_URL = "https://raw.githubusercontent.com/Maazaowski/Shortlisted/feed";

/** Stored in place of a country list when a remote role is open to anywhere. */
export const ANYWHERE = "*";

/**
 * The remote scope as a flat list of country codes, so "does this role admit
 * my country" is one array lookup in the database. Regions are expanded and
 * exclusions removed. [ANYWHERE] for a worldwide role with no exclusions,
 * empty when the role is not remote or does not say.
 */
export function admitCodes(scope: Pick<RemoteScope, "mode" | "allowed" | "excluded">): string[] {
  if (scope.mode !== "remote" || scope.allowed.length === 0) return [];
  const expand = (ids: string[]) => new Set(ids.flatMap((id) => REGIONS[id] ?? (id === WORLD ? [] : [id])));
  const excluded = expand(scope.excluded);
  if (scope.allowed.includes(WORLD)) {
    if (excluded.size === 0) return [ANYWHERE];
    // Worldwide with exclusions: every country in a known region except the excluded ones.
    const everywhere = new Set(Object.values(REGIONS).flat());
    return [...everywhere].filter((c) => !excluded.has(c)).sort();
  }
  return [...expand(scope.allowed)].filter((c) => !excluded.has(c)).sort();
}

/** Parses feed file text, one JSON listing per line. Lines that do not fit the schema are counted, not fatal. */
export function parseFeedLines(text: string): { listings: FeedListing[]; skipped: number } {
  const listings: FeedListing[] = [];
  let skipped = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = FeedListingSchema.safeParse(JSON.parse(line));
      if (parsed.success) listings.push(parsed.data);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { listings, skipped };
}

/** Days after which a posting is flagged as possibly stale. */
export const STALE_AFTER_DAYS = 45;

export function daysSince(date: Date | string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / 86_400_000));
}
