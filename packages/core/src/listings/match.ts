import { skillCovered } from "../skills.js";

export type ListingMatch = {
  /** 0 to 100. Only for ordering and a rough label; it is not a verdict. */
  score: number;
  /** Skills the posting names that the bank has. */
  shown: string[];
  /** Skills the posting names that the bank does not have. */
  missing: string[];
  /** The listing's title contains every word of one of the target titles. */
  titleMatch: boolean;
};

/** Words that say nothing about what the job is. */
const FILLER = new Set(["senior", "sr", "junior", "jr", "lead", "staff", "principal", "mid", "associate", "of", "the", "and", "a", "an", "in", "for", "i", "ii", "iii"]);

function words(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9#+.]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w && !FILLER.has(w));
}

/** How much of the best target title appears in the listing's title: 1 all of it, 0.5 at least half, else 0. */
function titleScore(targetTitles: string[], title: string): number {
  const have = new Set(words(title));
  let best = 0;
  for (const target of targetTitles) {
    const want = words(target);
    if (want.length === 0) continue;
    const hit = want.filter((w) => have.has(w)).length / want.length;
    best = Math.max(best, hit === 1 ? 1 : hit >= 0.5 ? 0.5 : 0);
  }
  return best;
}

/** A posting that names one skill should not score as a full match for having it. */
const MIN_SKILLS = 4;

/**
 * Compares one listing with the bank, in code, so the whole feed can be
 * ordered with no model call. Skills weigh 70 and the title 30. The skills
 * come from a fixed vocabulary (extractSkills), so this is a rough guide:
 * the fit score after tailoring, which reads the posting properly, is the
 * one to trust.
 */
export function matchListing(bankSkills: Set<string>, targetTitles: string[], listing: { title: string; skills: string[] }): ListingMatch {
  const shown = listing.skills.filter((s) => skillCovered(s, bankSkills));
  const missing = listing.skills.filter((s) => !skillCovered(s, bankSkills));
  const skill = listing.skills.length === 0 ? 0 : shown.length / Math.max(listing.skills.length, MIN_SKILLS);
  const title = titleScore(targetTitles, listing.title);
  return { score: Math.round(skill * 70 + title * 30), shown, missing, titleMatch: title === 1 };
}
