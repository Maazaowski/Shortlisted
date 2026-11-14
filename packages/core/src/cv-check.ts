import type { Bank } from "./schemas.js";

/**
 * The CV check: fixed rules over the experience bank, no model call. It looks
 * for what an employer abroad trips over (personal details, a phone number
 * with no country code) and for what makes a resume weak anywhere (no numbers,
 * long bullets, duties instead of results). It never edits the bank; each
 * finding says what to change and shows the lines it is about.
 */

export type CvFinding = {
  id: string;
  /** "fix" is a mistake; "improve" would make the resume stronger. */
  severity: "fix" | "improve";
  title: string;
  detail: string;
  /** The lines from the bank the finding is about, at most five. */
  examples: string[];
  /** Taken off the score of 100. */
  points: number;
};

export type CvCheck = {
  /** 0 to 100. */
  score: number;
  findings: CvFinding[];
  /** What the rules looked at and found in order, as sentences. */
  passed: string[];
};

/** `where` is "Title, Organisation", the role a bullet sits under. */
type Line = { text: string; where: string; skills: string[] };
type Rule = { passed: string; check: (bank: Bank, bullets: Line[]) => CvFinding | null };

const MAX_EXAMPLES = 5;
const sample = (lines: string[]) => lines.slice(0, MAX_EXAMPLES);
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const share = (n: number, of: number) => (of === 0 ? 0 : n / of);

const PERSONAL: [RegExp, string][] = [
  [/\b(date of birth|d\.o\.b\.?|dob)\b/i, "date of birth"],
  [/\bage\s*:?\s*\d{2}\b/i, "age"],
  [/\bmarital status\b|\b(married|unmarried)\b/i, "marital status"],
  [/\b(cnic|nic no|national id|aadhaar|id card (no|number))\b/i, "national ID number"],
  [/\bpassport (no|number|#)/i, "passport number"],
  [/\bfather'?s name\b/i, "father's name"],
  [/\b(religion|gender|nationality)\s*:/i, "religion, gender or nationality"],
];

const WEAK_OPENER = /^(responsible for|worked on|helped( to| with)?|assisted( in| with)?|participated in|involved in|duties included|tasked with|was part of)\b/i;
const FIRST_PERSON = /(^|[^A-Za-z])(I|I'm|I've)([^A-Za-z]|$)|\b(my|we|our)\b/;

const RULES: Rule[] = [
  {
    passed: "No personal details that employers abroad do not expect.",
    check: (bank, bullets) => {
      const lines = [bank.headline, bank.summary, bank.location ?? "", ...bank.links.map((l) => l.label), ...bullets.map((b) => b.text)];
      const found = new Map<string, string>();
      for (const line of lines) for (const [re, name] of PERSONAL) if (!found.has(name) && re.test(line)) found.set(name, line);
      if (found.size === 0) return null;
      return {
        id: "personal-details",
        severity: "fix",
        title: "Take out personal details",
        detail: `Found: ${[...found.keys()].join(", ")}. Employers in most countries do not expect these on a resume, and many screen them out so they cannot be accused of bias. Leave out photo, age, marital status, religion and ID numbers.`,
        examples: sample([...new Set(found.values())]),
        points: 15,
      };
    },
  },
  {
    passed: "Email address looks right.",
    check: (bank) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bank.email.trim())
        ? null
        : { id: "email", severity: "fix", title: "Add a working email address", detail: "The email in your profile is missing or not an address. It is the first thing a recruiter uses.", examples: bank.email.trim() ? [bank.email] : [], points: 10 },
  },
  {
    passed: "Phone number has a country code.",
    check: (bank) => {
      const phone = (bank.phone ?? "").trim();
      if (!phone) return { id: "phone", severity: "improve", title: "Add a phone number", detail: "Write it with the country code, for example +92 300 1234567, so someone abroad can call it.", examples: [], points: 5 };
      if (/^(\+|00)\d/.test(phone)) return null;
      return { id: "phone", severity: "fix", title: "Write your phone number with the country code", detail: "A recruiter in another country cannot dial a local number. Start it with + and the country code, for example +92 300 1234567.", examples: [phone], points: 10 };
    },
  },
  {
    passed: "Location gives a city and a country.",
    check: (bank) => {
      const location = (bank.location ?? "").trim();
      if (location.includes(",")) return null;
      return {
        id: "location",
        severity: "improve",
        title: location ? "Give your city and country" : "Add your location",
        detail: "Write city and country, for example Lahore, Pakistan. A reader abroad may not know the city, and remote roles are filtered by country. A street address is not needed.",
        examples: location ? [location] : [],
        points: 5,
      };
    },
  },
  {
    passed: "LinkedIn profile is linked.",
    check: (bank) =>
      bank.links.some((l) => /linkedin\.com/i.test(l.url))
        ? null
        : { id: "linkedin", severity: "improve", title: "Add your LinkedIn profile", detail: "Most recruiters look for it, and many application forms ask for it. Add the link in your profile.", examples: [], points: 5 },
  },
  {
    passed: "Summary is there and short.",
    check: (bank) => {
      const n = wordCount(bank.summary);
      if (n >= 10 && n <= 80) return null;
      return {
        id: "summary",
        severity: "improve",
        title: n < 10 ? "Write a base summary" : "Shorten the summary",
        detail: n < 10 ? "Two or three sentences on what you do and your strongest result. Tailoring starts from it." : `It is ${n} words. Two or three sentences, under 80 words, is what gets read.`,
        examples: [],
        points: 5,
      };
    },
  },
  {
    passed: "Every role has a start date.",
    check: (bank) => {
      const missing = bank.entries.filter((e) => e.kind === "ROLE" && !e.startDate);
      if (missing.length === 0) return null;
      return { id: "dates", severity: "fix", title: "Add dates to every role", detail: "A role with no dates reads as something to hide, and screening software often drops it. Month and year are enough.", examples: sample(missing.map((e) => `${e.title}, ${e.organization}`)), points: 10 };
    },
  },
  {
    passed: "Every role has at least two bullets.",
    check: (bank) => {
      const thin = bank.entries.filter((e) => e.kind === "ROLE" && e.bullets.length < 2);
      if (thin.length === 0) return null;
      return { id: "thin-roles", severity: "improve", title: "Say more about these roles", detail: "A role with one bullet or none gives tailoring nothing to choose from. Aim for three to six per role, more for recent ones.", examples: sample(thin.map((e) => `${e.title}, ${e.organization}`)), points: 5 };
    },
  },
  {
    passed: "Most bullets carry a number.",
    check: (_bank, bullets) => {
      const without = bullets.filter((b) => !/\d/.test(b.text));
      const ratio = share(bullets.length - without.length, bullets.length);
      if (ratio >= 0.5) return null;
      return {
        id: "numbers",
        severity: "improve",
        title: "Put numbers in more bullets",
        detail: `${bullets.length - without.length} of ${bullets.length} bullets have a number. Aim for half. How many, how much, how fast, how often: users, revenue, hours saved, team size. Only numbers that are true.`,
        examples: sample(without.map((b) => b.text)),
        points: ratio < 0.25 ? 20 : 10,
      };
    },
  },
  {
    passed: "Bullets start with what you did.",
    check: (_bank, bullets) => {
      const weak = bullets.filter((b) => WEAK_OPENER.test(b.text.trim()));
      if (weak.length === 0) return null;
      return { id: "weak-openers", severity: "improve", title: "Start bullets with what you did", detail: "Responsible for, Worked on and Helped describe a duty, not a result. Start with the verb for what you did: Built, Cut, Led, Migrated.", examples: sample(weak.map((b) => b.text)), points: weak.length > 3 ? 10 : 5 };
    },
  },
  {
    passed: "No bullet is too long.",
    check: (_bank, bullets) => {
      const long = bullets.filter((b) => wordCount(b.text) > 35);
      if (long.length === 0) return null;
      return { id: "long-bullets", severity: "improve", title: "Shorten the long bullets", detail: "Over 35 words runs past two lines on the page and gets skipped. Split it in two, or cut to the action and the result.", examples: sample(long.map((b) => b.text)), points: long.length > 3 ? 10 : 5 };
    },
  },
  {
    passed: "Bullets are written without I or we.",
    check: (_bank, bullets) => {
      const first = bullets.filter((b) => FIRST_PERSON.test(b.text));
      if (first.length === 0) return null;
      return { id: "first-person", severity: "improve", title: "Drop I, my and we from bullets", detail: "Resume bullets leave the subject out: Built the billing service, not I built the billing service.", examples: sample(first.map((b) => b.text)), points: 5 };
    },
  },
  {
    passed: "Skills are listed.",
    check: (bank) => {
      const n = bank.skillGroups.reduce((sum, g) => sum + g.skills.length, 0);
      if (n >= 5) return null;
      return { id: "skills", severity: "improve", title: "List your skills", detail: "Fewer than five skills are listed in your profile. Screening software and the job matching here both read this list.", examples: [], points: 5 };
    },
  },
  {
    passed: "Most bullets are tagged with skills.",
    check: (_bank, bullets) => {
      const untagged = bullets.filter((b) => b.skills.length === 0);
      if (share(untagged.length, bullets.length) <= 0.5) return null;
      return { id: "untagged", severity: "improve", title: "Tag bullets with the skills they show", detail: `${untagged.length} of ${bullets.length} bullets have no skill tags. Matching and the fit score only count a skill the bank names, so untagged work does not count for you.`, examples: sample(untagged.map((b) => b.text)), points: 10 };
    },
  },
];

export function checkCv(bank: Bank): CvCheck {
  const bullets: Line[] = bank.entries.flatMap((e) => e.bullets.map((b) => ({ text: b.text, where: `${e.title}, ${e.organization}`, skills: b.skills })));

  if (bullets.length === 0) {
    return {
      score: 0,
      findings: [{ id: "empty", severity: "fix", title: "The bank has no bullets", detail: "Import your resume, or add roles and bullets by hand. There is nothing to check or to tailor from yet.", examples: [], points: 100 }],
      passed: [],
    };
  }

  const findings: CvFinding[] = [];
  const passed: string[] = [];
  for (const rule of RULES) {
    const finding = rule.check(bank, bullets);
    if (finding) findings.push(finding);
    else passed.push(rule.passed);
  }
  findings.sort((a, b) => (a.severity === b.severity ? b.points - a.points : a.severity === "fix" ? -1 : 1));
  return { score: Math.max(0, 100 - findings.reduce((sum, f) => sum + f.points, 0)), findings, passed };
}
