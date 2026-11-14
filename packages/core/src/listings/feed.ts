import { z } from "zod";
import { CAREER_FIELDS, POOLS, type CareerFieldId } from "../preferences.js";
import { classifyField } from "./fields.js";
import { remoteScope, type RemoteHints } from "./remote.js";
import { extractSkills } from "./skills.js";
import { sponsorship } from "./sponsorship.js";

/**
 * One row of the shared job feed. The feed builder writes these and every
 * install reads them, so this schema is the contract between the two. Add
 * fields as optional; never repurpose one.
 */

const FIELD_IDS = CAREER_FIELDS.map((f) => f.id) as [CareerFieldId, ...CareerFieldId[]];

export const FEED_VERSION = 1;

/** Which feed files a listing is written to. Regional families are the regional pools. */
export const FEED_FAMILIES = ["remote", "relocate", "gulf"] as const;
export type FeedFamily = (typeof FEED_FAMILIES)[number];

const RemoteScopeSchema = z.object({
  mode: z.enum(["remote", "hybrid", "onsite", "unknown"]),
  allowed: z.array(z.string()),
  excluded: z.array(z.string()),
  countries: z.array(z.string()),
  confidence: z.enum(["stated", "likely", "unclear"]),
  evidence: z.string().nullable(),
});

const SponsorshipSchema = z.object({
  visa: z.enum(["offered", "refused", "unknown"]),
  relocation: z.enum(["offered", "unknown"]),
  evidence: z.string().nullable(),
  /** Countries the visa offer names. Added after version 1 shipped, so older feeds lack it. */
  countries: z.array(z.string()).default([]),
});

export const FeedListingSchema = z.object({
  /** Stable across builds: source, board and the source's own job id. */
  id: z.string().min(3),
  /** Where it was fetched from, for attribution and debugging: "greenhouse", "lever" and so on. */
  source: z.string().min(1),
  company: z.string().min(1),
  title: z.string().min(1),
  /** The employer's own page for this job. */
  url: z.url(),
  location: z.string().nullable(),
  remote: RemoteScopeSchema,
  sponsorship: SponsorshipSchema,
  /** Country codes where the employer is on a government register of licensed visa sponsors. */
  licensedSponsor: z.array(z.string()).default([]),
  field: z.enum(FIELD_IDS),
  skills: z.array(z.string()),
  /** Plain text, trimmed. The full posting is at `url`. */
  description: z.string(),
  employmentType: z.string().nullable().default(null),
  postedAt: z.iso.datetime().nullable(),
  /** When the feed first saw it. Carried forward from build to build. */
  firstSeenAt: z.iso.datetime(),
  families: z.array(z.enum(FEED_FAMILIES)).min(1),
});

export type FeedListing = z.infer<typeof FeedListingSchema>;

export const FeedMetaSchema = z.object({
  version: z.number().int(),
  builtAt: z.iso.datetime(),
  counts: z.object({ listings: z.number().int(), companies: z.number().int(), fields: z.number().int() }),
  /** File name and row count per family. */
  files: z.array(z.object({ family: z.enum(FEED_FAMILIES), name: z.string(), listings: z.number().int() })),
  /** Sources that must be credited where their listings are shown. */
  attribution: z.array(z.object({ source: z.string(), name: z.string(), url: z.url() })).default([]),
});

export type FeedMeta = z.infer<typeof FeedMetaSchema>;

/** What a source adapter hands over before classification. */
export type RawListing = {
  source: string;
  /** The board or account the job came from, part of the id. */
  board: string;
  sourceId: string;
  company: string;
  title: string;
  url: string;
  location: string | null;
  /** Plain text. */
  description: string;
  postedAt: string | null;
  employmentType?: string | null;
  hints?: RemoteHints;
};

const DESCRIPTION_LIMIT = 6000;

const GULF = new Set<string>(POOLS.find((p) => p.id === "gulf")?.countries ?? []);

/** The families a classified listing belongs to. Empty means the feed does not carry it. */
export function feedFamilies(listing: Pick<FeedListing, "remote" | "sponsorship" | "licensedSponsor">): FeedFamily[] {
  const out: FeedFamily[] = [];
  const { remote, sponsorship: s } = listing;
  if (remote.mode === "remote") out.push("remote");
  const abroad = remote.mode !== "remote";
  const sponsorOnRegister = remote.countries.some((c) => listing.licensedSponsor.includes(c));
  // "We sponsor visas to Germany" on a role in another country is not an offer for this role.
  const named = s.countries ?? [];
  const visaHere = s.visa === "offered" && (named.length === 0 || remote.countries.length === 0 || remote.countries.some((c) => named.includes(c)));
  if (s.visa !== "refused" && (visaHere || s.relocation === "offered" || (abroad && sponsorOnRegister))) out.push("relocate");
  if (abroad && remote.countries.some((c) => GULF.has(c))) out.push("gulf");
  return out;
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Classifies one raw listing. Returns null when it belongs to no family, when
 * it is missing something the schema needs, or when its link is not https.
 */
export function classifyListing(raw: RawListing, opts: { firstSeenAt: string; licensedSponsor?: string[] }): FeedListing | null {
  const description = raw.description.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const title = raw.title.trim();
  const company = raw.company.trim();
  if (!title || !company || !/^https:\/\//.test(raw.url)) return null;

  const remote = remoteScope(raw.location, description, { ...raw.hints, title });
  const s = sponsorship(description);
  const licensedSponsor = opts.licensedSponsor ?? [];
  const families = feedFamilies({ remote, sponsorship: s, licensedSponsor });
  if (families.length === 0) return null;

  const candidate = {
    id: `${raw.source}:${raw.board}:${raw.sourceId}`,
    source: raw.source,
    company,
    title,
    url: raw.url,
    location: raw.location?.trim() || null,
    remote,
    sponsorship: s,
    licensedSponsor,
    field: classifyField(title),
    skills: extractSkills(`${title}\n${description}`),
    description: description.length > DESCRIPTION_LIMIT ? `${description.slice(0, DESCRIPTION_LIMIT)}\n...` : description,
    employmentType: raw.employmentType?.trim() || null,
    postedAt: toIso(raw.postedAt),
    firstSeenAt: opts.firstSeenAt,
    families,
  };
  const parsed = FeedListingSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
