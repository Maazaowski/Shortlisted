import { covers, findPlaces, WORLD } from "./places.js";

/**
 * Where a role can be done from. The feed stores this scope, not a yes or no
 * for one country, so the same feed works for a reader anywhere.
 *
 * Confidence is about the evidence, not the answer:
 *   stated   the posting says it in so many words (location field or a sentence)
 *   likely   implied, for example "work from anywhere" in the body of a remote role
 *   unclear  the posting says "Remote" and nothing about where
 */

export type WorkMode = "remote" | "hybrid" | "onsite" | "unknown";
export type Confidence = "stated" | "likely" | "unclear";

export type RemoteScope = {
  mode: WorkMode;
  /** Country codes and region ids a remote worker may be based in. ["WORLD"] means anywhere. Empty when not known. */
  allowed: string[];
  /** Places the posting rules out. */
  excluded: string[];
  /** For office and hybrid roles, the countries of the office. */
  countries: string[];
  confidence: Confidence;
  /** The words that decided it, for the reader to check. */
  evidence: string | null;
};

/** Structured fields some job boards expose alongside the free text. */
/** `title` is used only when the location field is silent: "Account Director - EMEA" on a role marked "Remote". */
export type RemoteHints = { remote?: boolean | null; workplace?: string | null; countryCode?: string | null; title?: string | null };

const REMOTE_WORDS = /\b(remote|anywhere|work from home|wfh|distributed|worldwide|telecommute)\b/i;
const STRONG_REMOTE_IN_BODY = /\b((fully|100%|completely|entirely) remote|remote[- ]first|this (is a|role is|position is) (fully )?remote|work(ing)? remotely from)\b/i;

const RESTRICTIONS: RegExp[] = [
  /\b(must|need to|needs to|should|required to|has to|have to)\s+(be\s+)?(currently\s+)?(based|located|reside|residing|live|living|domiciled)\s+(in|within)\b/i,
  /\b(authori[sz]ed|authori[sz]ation|eligible|eligibility|legally (able|permitted|entitled)|right|permission)\s+to\s+work\s+in\b/i,
  /\b(only|exclusively)\s+(open|available|hiring|considering|accepting|able to hire)\b[^.]*\b(in|from|to|within)\b/i,
  /\b(candidates|applicants|you|employees)\s+(must be|must currently be|are required to be|should be|need to be)\s+(based|located|resident|residing)\s+(in|within)\b/i,
  /\bremote\s*(\(|-|,|:)?\s*(with)?in\b/i,
  /\bresidents?\s+of\b/i,
  /\b(open to|hiring|available to|considering)\s+(remote\s+)?(candidates|applicants|talent|people|engineers)\s+(based\s+|located\s+|living\s+)?(in|from|across|within)\b/i,
  /\b(must be|should be|need to be|are|is|only|be)\s+(US|U\.S\.|UK|EU|Canada|Europe|Australia|India)[- ]based\b/,
  /\b(US|U\.S\.|UK|EU|Canada|Europe|Australia|India)[- ]based\s+(applicants|candidates|employees|individuals|residents)\s+only\b/,
  /\b(based|located) in one of the following\b/i,
  /\b(this|the) (role|position|job) is (open|available|restricted|limited) to\b/i,
];

const EXCLUSIONS: RegExp[] = [
  /\b(unable|not able|cannot|can't|can not|do not|don't|not currently able)\s+(to\s+)?(hire|employ|consider|accept|support)\b[^.]*\b(in|from|outside)\b/i,
  /\b(not|isn't|is not)\s+(open|available)\s+to\s+(candidates|applicants|residents)\b[^.]*\b(in|from)\b/i,
  /\bexcluding\b/i,
];

const WORLD_IN_BODY = /\b(work from anywhere|anywhere in the world|from anywhere|hire (people |talent )?(from )?(anywhere|globally|worldwide|all over the world)|any country|location[- ]agnostic|regardless of (your )?location|no matter where you (live|are))\b/i;
const TIMEZONE = /\b(time ?zones?|overlap|working hours|business hours)\b[^.]*\b(EST|EDT|PST|PDT|CST|CET|CEST|GMT|UTC|ET|PT|BST|IST|eastern|pacific|central european)\b/i;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 600);
}

/** "Central European Time" names a time zone, not a place someone may live. */
const TIMEZONE_NAMES = /\b(central|eastern|western)\s+european(\s+(summer\s+)?time)?\b|\b(india|china|japan|british summer)\s+(standard\s+)?time\b/gi;

function placeIds(text: string): string[] {
  const p = findPlaces(text.replace(TIMEZONE_NAMES, " "));
  return [...p.regions, ...p.countries];
}

function clip(s: string): string {
  return s.length > 240 ? `${s.slice(0, 237)}...` : s;
}

export function remoteScope(location: string | null, description: string, hints: RemoteHints = {}): RemoteScope {
  const loc = (location ?? "").trim();
  const workplace = (hints.workplace ?? "").toLowerCase();
  const locPlaces = findPlaces(loc);
  const hinted = hints.countryCode ? [hints.countryCode.toUpperCase()] : [];
  const officeCountries = [...new Set([...locPlaces.countries, ...hinted])];

  let mode: WorkMode;
  let fromBody = false;
  if (/hybrid/i.test(loc) || workplace.includes("hybrid")) mode = "hybrid";
  else if (hints.remote === true || workplace.includes("remote") || REMOTE_WORDS.test(loc) || locPlaces.world) mode = "remote";
  else if (STRONG_REMOTE_IN_BODY.test(description)) {
    mode = "remote";
    fromBody = true;
  } else if (loc || hinted.length || workplace.includes("site")) mode = "onsite";
  else mode = "unknown";

  if (mode !== "remote") {
    return { mode, allowed: [], excluded: [], countries: officeCountries, confidence: officeCountries.length ? "stated" : "unclear", evidence: loc || null };
  }

  const lines = sentences(description);
  const excluded = new Set<string>();
  for (const s of lines) if (EXCLUSIONS.some((re) => re.test(s))) for (const id of placeIds(s)) excluded.add(id);

  let restriction: { ids: string[]; evidence: string } | null = null;
  for (const s of lines) {
    if (EXCLUSIONS.some((re) => re.test(s)) || !RESTRICTIONS.some((re) => re.test(s))) continue;
    const ids = placeIds(s);
    if (ids.length) {
      restriction = { ids, evidence: clip(s) };
      break;
    }
  }

  const done = (allowed: string[], confidence: Confidence, evidence: string | null): RemoteScope => ({
    mode: "remote",
    allowed: allowed.filter((id) => !excluded.has(id)),
    excluded: [...excluded],
    countries: [],
    confidence,
    evidence,
  });

  // A named place in the location field is the clearest statement there is.
  const locIds = [...locPlaces.regions, ...locPlaces.countries];
  if (locIds.length) return done(locIds, "stated", loc);
  // A restriction in the body beats "Remote, Worldwide" in the field: it is the more specific of the two.
  if (restriction) return done(restriction.ids, "stated", restriction.evidence);
  if (locPlaces.world) return done([WORLD], "stated", loc);
  // A board that marks a role remote and names one country almost always means remote within it.
  if (hinted.length && !fromBody) return done(hinted, "likely", loc || null);

  // "Remote" in the field and a region in the title: "Renewals Manager EMEA".
  const titleIds = hints.title ? placeIds(hints.title) : [];
  if (titleIds.length) return done(titleIds, "likely", hints.title ?? null);

  const anywhere = lines.find((s) => WORLD_IN_BODY.test(s));
  if (anywhere) {
    // "From anywhere in Europe" is a region, not the world.
    const named = placeIds(anywhere);
    return done(named.length ? named : [WORLD], "likely", clip(anywhere));
  }
  const timezone = lines.find((s) => TIMEZONE.test(s));
  return done([], "unclear", timezone ? clip(timezone) : loc || null);
}

export type Admits = "yes" | "no" | "unclear";

/** Can someone living in this country take the role as a remote worker? */
export function admitsCountry(scope: RemoteScope, country: string): Admits {
  if (scope.mode !== "remote") return "no";
  if (covers(scope.excluded, country)) return "no";
  if (scope.allowed.length === 0) return "unclear";
  return covers(scope.allowed, country) ? "yes" : "no";
}
