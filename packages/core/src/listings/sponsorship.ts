import { findPlaces } from "./places.js";

/**
 * What a posting says about visas and relocation. Only explicit statements
 * count, and the sentence that decided it is kept so the reader can check.
 * Silence is "unknown", never a guess either way.
 */

export type Sponsorship = {
  visa: "offered" | "refused" | "unknown";
  relocation: "offered" | "unknown";
  /** The sentence behind the visa answer, or behind relocation when visa is unknown. */
  evidence: string | null;
  /**
   * Country codes the offer names, as in "we can sponsor visas to Germany".
   * Empty when the offer names no country, which is not the same as every country.
   */
  countries: string[];
};

const SPONSOR = /sponsor(ship|ed|ing|s)?\b/i;

const REFUSED: RegExp[] = [
  /\b(not|unable to|cannot|can't|can not|do not|don't|does not|doesn't|won't|will not|no longer|not able to|not in a position to)\b[^.]{0,60}\bsponsor/i,
  // "may not be able to employ candidates on certain visa categories, or support future H-1B sponsorship"
  /\b(not|unable to|cannot|can't|can not)\b.{0,300}\b(or|nor)\s+(to\s+)?(support|provide|offer)\b[^.]{0,40}\bsponsor/i,
  /\bno\s+(visa\s+|work\s+permit\s+|employment\s+)?sponsorship\b/i,
  /\bwithout\s+(the\s+)?(need\s+for\s+|requiring\s+)?((visa|employer|employment|company|current\s+or\s+future)\s+){0,3}sponsorship\b/i,
  // "visa sponsorship and relocation support are not available"
  /\bsponsorship\b[^.]{0,60}\b(is|are|will\s+be)\s+not\s+(available|offered|provided|possible)\b/i,
  /\bsponsorship\s*[:\-–]?\s*(is\s+|will\s+)?(not|n't|unavailable|no)\b/i,
  /\bmust\s+(already\s+)?(have|hold|possess)\b[^.]{0,40}\b(right|authori[sz]ation|permission|permit|visa)\s+to\s+work\b/i,
  /\b(existing|valid|current|unrestricted)\s+(right|authori[sz]ation|permit)\s+to\s+work\b[^.]{0,40}\b(required|essential|must)\b/i,
];

const OFFERED: RegExp[] = [
  /\b(visa|immigration|work permit)\s+(sponsorship|support|assistance)\b/i,
  /\bsponsor(ship)?\s+(is\s+|will be\s+)?(available|offered|provided|possible|considered)\b/i,
  /\bsponsor\s+(your\s+|a\s+|the\s+)?(work\s+)?(visa|permit)s?\b/i,
  /\b(h-?1b|blue card|skilled worker visa|work visa)\s+(sponsorship|transfer|support|is provided|provided)\b/i,
  // "Tier 2 support" is a help desk, so tier 2 needs a visa word after it.
  /\btier 2\s+(visa|sponsorship|sponsor licen[cs]e|certificate of sponsorship)\b/i,
];

/**
 * "We sponsor" on its own also describes scholarships, events and charities,
 * so it only counts in a sentence that is about hiring or immigration.
 */
const WE_SPONSOR = /\b(we|will|can|able to|happy to|glad to|do)\s+(\w+\s+){0,3}sponsor\b/i;
const HIRING_CONTEXT = /\b(visas?|permits?|blue card|immigration|h-?1b|work authori[sz]ation|right to work|candidates?|applicants?|this (role|position)|relocat\w*)\b/i;

function offers(s: string): boolean {
  return OFFERED.some((re) => re.test(s)) || (WE_SPONSOR.test(s) && HIRING_CONTEXT.test(s));
}

const RELOCATION: RegExp[] = [
  /\brelocation\s+(assistance|support|package|allowance|bonus|benefit|budget|help|is provided|provided|offered|available)\b/i,
  /\b(we|will|we'll)\s+(\w+\s+){0,3}(help|support|assist|cover|pay)\b[^.]{0,40}\breloca/i,
  /\b(paid|sponsored|assisted|supported)\s+relocation\b/i,
  /\bhelp\s+(you\s+)?(to\s+)?relocate\b/i,
];

const NO_RELOCATION = /\b(no|not|without|unable to|cannot|do not|don't)\b[^.]{0,40}\breloca|\breloca[^.]{0,60}\b(not|no longer|unavailable|isn't|won't)\b/i;

function sentences(text: string): string[] {
  // The full stop in "U.S." or "U.K." does not end a sentence.
  return text
    .split(/(?<=[.!?])(?<!\b[A-Z]\.)\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 600);
}

function clip(s: string): string {
  return s.length > 240 ? `${s.slice(0, 237)}...` : s;
}

/**
 * The countries named in the part of the sentence that makes the offer. The
 * sentence is cut at "; " and at "but", so "we sponsor visas to Germany; for
 * any other country you need the right to work" names Germany and nothing else.
 */
function offerCountries(sentence: string): string[] {
  const clauses = sentence.split(/;|\bbut\b|\bhowever\b|\botherwise\b/i);
  const clause = clauses.find((c) => OFFERED.some((re) => re.test(c)) || WE_SPONSOR.test(c));
  return clause ? findPlaces(clause).countries : [];
}

export function sponsorship(description: string): Sponsorship {
  let visa: Sponsorship["visa"] = "unknown";
  let relocation: Sponsorship["relocation"] = "unknown";
  let visaEvidence: string | null = null;
  let relocationEvidence: string | null = null;
  let countries: string[] = [];

  for (const s of sentences(description)) {
    // A refusal anywhere outranks an offer: postings that sponsor do not also say they cannot.
    if (visa !== "refused" && REFUSED.some((re) => re.test(s))) {
      visa = "refused";
      visaEvidence = clip(s);
      countries = [];
    } else if (visa === "unknown" && (SPONSOR.test(s) || /\b(visa|work permit|blue card|immigration|h-?1b|tier 2)\b/i.test(s)) && offers(s)) {
      visa = "offered";
      visaEvidence = clip(s);
      countries = offerCountries(s);
    }
    if (relocation === "unknown" && RELOCATION.some((re) => re.test(s)) && !NO_RELOCATION.test(s)) {
      relocation = "offered";
      relocationEvidence = clip(s);
    }
  }
  return { visa, relocation, evidence: visaEvidence ?? relocationEvidence, countries };
}
