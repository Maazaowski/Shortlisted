import { z } from "zod";

/**
 * What the user is looking for. Used to decide which listings belong in which
 * pool and to rank them. None of this reaches a model.
 */

/** ISO 3166-1 alpha-2 codes, inhabited territories only. */
const COUNTRY_CODES =
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export type Country = { code: string; name: string };

export const COUNTRIES: Country[] = COUNTRY_CODES.map((code) => ({
  code,
  name: regionNames.of(code) ?? code,
})).sort((a, b) => a.name.localeCompare(b.name, "en"));

const COUNTRY_SET = new Set(COUNTRY_CODES);

export function countryName(code: string): string {
  return COUNTRY_SET.has(code) ? (regionNames.of(code) ?? code) : code;
}

export const DEFAULT_COUNTRY = "PK";

/** The career fields a listing is sorted into. "other" is the catch-all. */
export const CAREER_FIELDS = [
  { id: "software-engineering", label: "Software Engineering", tech: true },
  { id: "data-ai", label: "Data & AI", tech: true },
  { id: "devops-cloud", label: "DevOps & Cloud", tech: true },
  { id: "security", label: "Security", tech: true },
  { id: "qa-testing", label: "QA & Testing", tech: true },
  { id: "design", label: "Design", tech: false },
  { id: "product", label: "Product", tech: false },
  { id: "customer-support", label: "Customer Support", tech: false },
  { id: "sales", label: "Sales", tech: false },
  { id: "marketing", label: "Marketing", tech: false },
  { id: "writing", label: "Writing", tech: false },
  { id: "finance", label: "Finance", tech: false },
  { id: "hr-recruiting", label: "HR & Recruiting", tech: false },
  { id: "operations", label: "Operations", tech: false },
  { id: "consulting-strategy", label: "Consulting & Strategy", tech: false },
  { id: "other", label: "Other", tech: false },
] as const;

export type CareerFieldId = (typeof CAREER_FIELDS)[number]["id"];

/**
 * Pools a listing can fall into. Remote and Relocate depend on the user's
 * home country; a regional pool is a fixed list of countries to work in.
 */
export const POOLS = [
  {
    id: "remote",
    label: "Remote",
    description:
      "Work from home for a company elsewhere, where the role admits your country.",
    countries: null,
  },
  {
    id: "relocate",
    label: "Relocate",
    description:
      "Roles abroad that state visa sponsorship or relocation support.",
    countries: null,
  },
  {
    id: "gulf",
    label: "Gulf",
    description:
      "Office roles in Saudi Arabia, the UAE, Qatar, Bahrain, Kuwait and Oman.",
    countries: ["SA", "AE", "QA", "BH", "KW", "OM"],
  },
] as const;

export type PoolId = (typeof POOLS)[number]["id"];

const FIELD_IDS = CAREER_FIELDS.map((f) => f.id) as [
  CareerFieldId,
  ...CareerFieldId[],
];
const POOL_IDS = POOLS.map((p) => p.id) as [PoolId, ...PoolId[]];

const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .refine((c) => COUNTRY_SET.has(c), "Choose a country from the list.");

export const PreferencesSchema = z.object({
  homeCountry: countryCode,
  citizenship: countryCode,
  pools: z.array(z.enum(POOL_IDS)).min(1, "Choose at least one pool."),
  /** Empty means every field. */
  fields: z.array(z.enum(FIELD_IDS)),
  targetTitles: z.array(z.string().trim().min(2).max(80)).max(12),
  weeklyGoal: z.number().int().min(1).max(200).nullable(),
  feedUrl: z
    .url({
      protocol: /^https$/,
      error: "The feed address must start with https://.",
    })
    .nullable(),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  homeCountry: DEFAULT_COUNTRY,
  citizenship: DEFAULT_COUNTRY,
  pools: ["remote", "relocate", "gulf"],
  fields: [],
  targetTitles: [],
  weeklyGoal: null,
  feedUrl: null,
};

/** One title per line, trimmed, blank lines and repeats dropped. */
export function parseTitleLines(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const title = line.trim().replace(/\s+/g, " ");
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push(title);
  }
  return out;
}
