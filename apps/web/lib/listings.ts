import "server-only";
import { ANYWHERE, CAREER_FIELDS, countryName, matchListing, normalizeSkills, POOLS, type PoolId, type Preferences, type RemoteScope, type Sponsorship } from "@shortlisted/core";
import { Prisma, withUser } from "@shortlisted/db";
import { enqueueFeedSync } from "./queue";

/**
 * Reading the job listings. Which listings a user sees in a pool depends on
 * their preferences, so every query here takes them. All of it is database
 * filtering on what the feed's rules already decided; nothing is classified
 * at read time.
 */

export const PAGE_SIZE = 30;

export type JobsQuery = {
  pool: PoolId;
  q: string;
  /** A career field id, "any" for all fields, or "" for the fields chosen in Settings. */
  field: string;
  tech: boolean;
  recent: boolean;
  /** Remote pool only: also show roles that say Remote without saying where. */
  unclear: boolean;
  saved: boolean;
  /** Newest first, or best match with the bank first. */
  sort: "new" | "match";
  page: number;
};

const POOL_IDS = new Set<string>(POOLS.map((p) => p.id));
const FIELD_IDS = new Set<string>(CAREER_FIELDS.map((f) => f.id));
const TECH_FIELDS = CAREER_FIELDS.filter((f) => f.tech).map((f) => f.id);

export function parseJobsQuery(params: Record<string, string | string[] | undefined>, prefs: Preferences): JobsQuery {
  const one = (k: string) => (Array.isArray(params[k]) ? (params[k]?.[0] ?? "") : (params[k] ?? "")).trim();
  const pool = one("pool");
  const field = one("field");
  const page = Number.parseInt(one("page"), 10);
  return {
    pool: (POOL_IDS.has(pool) && prefs.pools.includes(pool as PoolId) ? pool : (prefs.pools[0] ?? "remote")) as PoolId,
    q: one("q").slice(0, 100),
    field: field === "any" || FIELD_IDS.has(field) ? field : "",
    tech: one("tech") === "1",
    recent: one("recent") === "1",
    unclear: one("unclear") === "1",
    saved: one("saved") === "1",
    sort: one("sort") === "match" ? "match" : "new",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** The listings that belong in a pool for this user. */
function poolWhere(pool: PoolId, prefs: Preferences, unclear: boolean): Prisma.ListingWhereInput {
  if (pool === "remote") {
    return {
      families: { has: "remote" },
      OR: [{ admits: { has: prefs.homeCountry } }, { admits: { has: ANYWHERE } }, ...(unclear ? [{ mode: "remote", admits: { isEmpty: true } }] : [])],
    };
  }
  if (pool === "relocate") {
    // A role in the country you live in, or the one whose passport you hold, is not a relocation.
    return { families: { has: "relocate" }, NOT: [{ mode: { not: "remote" }, countries: { hasSome: [...new Set([prefs.homeCountry, prefs.citizenship])] } }] };
  }
  return { families: { has: pool } };
}

function where(userId: string, query: JobsQuery, prefs: Preferences): Prisma.ListingWhereInput {
  const and: Prisma.ListingWhereInput[] = [poolWhere(query.pool, prefs, query.unclear)];
  if (query.field && query.field !== "any") and.push({ field: query.field });
  else if (query.field === "" && prefs.fields.length) and.push({ field: { in: prefs.fields } });
  if (query.tech) and.push({ field: { in: TECH_FIELDS } });
  if (query.recent) {
    const since = new Date(Date.now() - 30 * 86_400_000);
    and.push({ OR: [{ postedAt: { gte: since } }, { postedAt: null, firstSeenAt: { gte: since } }] });
  }
  if (query.q) {
    const contains = { contains: query.q, mode: "insensitive" as const };
    and.push({ OR: [{ title: contains }, { company: contains }, { description: contains }] });
  }
  if (query.saved) and.push({ savedAt: { not: null } });
  return { userId, closedAt: null, hiddenAt: null, AND: and };
}

const ROW = {
  id: true,
  title: true,
  company: true,
  location: true,
  mode: true,
  remote: true,
  admits: true,
  countries: true,
  sponsorship: true,
  licensedSponsor: true,
  field: true,
  skills: true,
  postedAt: true,
  firstSeenAt: true,
  createdAt: true,
  savedAt: true,
  applicationId: true,
} satisfies Prisma.ListingSelect;

export type ListingRow = Prisma.ListingGetPayload<{ select: typeof ROW }>;

export type JobsPage = {
  rows: ListingRow[];
  total: number;
  pages: number;
  /** Open roles, companies and fields in this pool for this user, before the other filters. */
  counts: { roles: number; companies: number; fields: number };
};

/** What a listing is matched against: every skill the bank names, and the titles the user is after. */
export type MatchContext = { skills: Set<string>; titles: string[] };

/** Null when there is no bank yet, so there is nothing to match against. */
export async function matchContext(userId: string, prefs: Preferences): Promise<MatchContext | null> {
  return withUser(userId, async (tx) => {
    const profile = await tx.profile.findUnique({ where: { userId }, select: { headline: true, skillGroups: true } });
    if (!profile) return null;
    const bullets = await tx.bankBullet.findMany({ where: { userId }, select: { skills: true } });
    const groups = Array.isArray(profile.skillGroups) ? (profile.skillGroups as { skills?: string[] }[]) : [];
    const all = [...groups.flatMap((g) => g.skills ?? []), ...bullets.flatMap((b) => b.skills)];
    return { skills: new Set(normalizeSkills(all)), titles: prefs.targetTitles.length ? prefs.targetTitles : [profile.headline] };
  });
}

const NEWEST: Prisma.ListingOrderByWithRelationInput[] = [{ postedAt: { sort: "desc", nulls: "last" } }, { firstSeenAt: "desc" }, { id: "asc" }];

/**
 * One page in best-match order. The match is code over a title and a list of
 * tags, so scoring every listing the filters leave is cheap, and it has to be
 * every one: the order depends on the bank, which the database cannot sort by.
 */
async function matchPage(tx: Prisma.TransactionClient, filter: Prisma.ListingWhereInput, page: number, ctx: MatchContext): Promise<ListingRow[]> {
  const all = await tx.listing.findMany({ where: filter, select: { id: true, title: true, skills: true }, orderBy: NEWEST });
  const ids = all
    .map((l, newest) => ({ id: l.id, newest, score: matchListing(ctx.skills, ctx.titles, l).score }))
    .sort((a, b) => b.score - a.score || a.newest - b.newest)
    .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    .map((l) => l.id);
  const rows = await tx.listing.findMany({ where: { id: { in: ids } }, select: ROW });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export async function listJobs(userId: string, query: JobsQuery, prefs: Preferences, ctx: MatchContext | null = null): Promise<JobsPage> {
  const filter = where(userId, query, prefs);
  const pool: Prisma.ListingWhereInput = { userId, closedAt: null, hiddenAt: null, AND: [poolWhere(query.pool, prefs, query.unclear)] };
  return withUser(userId, async (tx) => {
    const [rows, total, roles, companies, fields] = await Promise.all([
      query.sort === "match" && ctx
        ? matchPage(tx, filter, query.page, ctx)
        : tx.listing.findMany({ where: filter, select: ROW, orderBy: NEWEST, skip: (query.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      tx.listing.count({ where: filter }),
      tx.listing.count({ where: pool }),
      tx.listing.groupBy({ by: ["company"], where: pool }),
      tx.listing.groupBy({ by: ["field"], where: pool }),
    ]);
    return { rows, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), counts: { roles, companies: companies.length, fields: fields.length } };
  });
}

export async function getListing(userId: string, id: string) {
  return withUser(userId, (tx) => tx.listing.findFirst({ where: { id, userId } }));
}

export type FeedStatus = {
  syncedAt: Date | null;
  builtAt: Date | null;
  lastError: string | null;
  attribution: { source: string; name: string; url: string }[];
  /** Listings created after this are marked new. Null on the first visits. */
  newSince: Date | null;
  hasListings: boolean;
};

const STALE_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const VISIT_GAP_MS = 30 * 60 * 1000;

/**
 * The feed's state for the jobs page. Reading it does two small jobs, the
 * same way the board syncs reminders: it asks the worker for a sync when the
 * last one is over a day old (the machine may have been off), and it records
 * the visit so the next one can mark what is new.
 */
export async function feedStatus(userId: string): Promise<FeedStatus> {
  const now = new Date();
  const { state, hasListings } = await withUser(userId, async (tx) => {
    const current = await tx.feedSync.findUnique({ where: { userId } });
    let visitAt = current?.visitAt ?? null;
    let prevVisitAt = current?.prevVisitAt ?? null;
    if (!visitAt || now.getTime() - visitAt.getTime() > VISIT_GAP_MS) {
      prevVisitAt = visitAt;
      visitAt = now;
      await tx.feedSync.upsert({ where: { userId }, create: { userId, visitAt, prevVisitAt }, update: { visitAt, prevVisitAt } });
    }
    return { state: { ...current, visitAt, prevVisitAt }, hasListings: (await tx.listing.count({ where: { userId }, take: 1 })) > 0 };
  });

  const syncedAt = state.syncedAt ?? null;
  const attemptedAt = state.attemptedAt ?? null;
  const stale = !syncedAt || now.getTime() - syncedAt.getTime() > STALE_MS;
  const triedRecently = attemptedAt !== null && now.getTime() - attemptedAt.getTime() < RETRY_MS;
  if (stale && !triedRecently) {
    try {
      await enqueueFeedSync(userId);
    } catch (err) {
      console.error("[feed-sync] could not enqueue:", (err as Error).message);
    }
  }

  return {
    syncedAt,
    builtAt: state.builtAt ?? null,
    lastError: state.lastError ?? null,
    attribution: Array.isArray(state.attribution) ? (state.attribution as FeedStatus["attribution"]) : [],
    newSince: state.prevVisitAt ?? null,
    hasListings,
  };
}

export type Tag = { text: string; tone: "good" | "warn" | "plain"; evidence: string | null };

/**
 * What to say about a listing's eligibility, in words. The tone is about how
 * sure the posting is, never about how good the job is. Every tag that makes a
 * claim carries the posting's own words.
 */
export function eligibilityTags(l: Pick<ListingRow, "mode" | "remote" | "admits" | "countries" | "sponsorship" | "licensedSponsor">, prefs: Preferences): Tag[] {
  const remote = l.remote as RemoteScope;
  const sponsor = l.sponsorship as Sponsorship;
  const home = countryName(prefs.homeCountry);
  const tags: Tag[] = [];

  if (l.mode === "remote") {
    if (l.admits.includes(ANYWHERE)) tags.push({ text: remote.confidence === "stated" ? "Remote, anywhere" : "Remote, probably anywhere", tone: remote.confidence === "stated" ? "good" : "warn", evidence: remote.evidence });
    else if (l.admits.includes(prefs.homeCountry)) tags.push({ text: remote.confidence === "stated" ? `Remote, admits ${home}` : `Remote, probably admits ${home}`, tone: remote.confidence === "stated" ? "good" : "warn", evidence: remote.evidence });
    else if (l.admits.length === 0) tags.push({ text: "Remote, does not say where", tone: "warn", evidence: remote.evidence });
    else tags.push({ text: `Remote, not ${home}`, tone: "plain", evidence: remote.evidence });
  } else if (l.countries.length) {
    tags.push({ text: `${l.mode === "hybrid" ? "Hybrid" : "Office"} in ${l.countries.map(countryName).join(", ")}`, tone: "plain", evidence: null });
  }

  if (sponsor.visa === "offered") tags.push({ text: "Visa sponsorship stated", tone: "good", evidence: sponsor.evidence });
  if (sponsor.visa === "refused") tags.push({ text: "No visa sponsorship", tone: "plain", evidence: sponsor.evidence });
  if (sponsor.relocation === "offered") tags.push({ text: "Relocation support stated", tone: "good", evidence: sponsor.visa === "unknown" ? sponsor.evidence : null });
  if (sponsor.visa === "unknown" && l.licensedSponsor.some((c) => l.countries.includes(c))) {
    tags.push({ text: "Employer is a licensed UK sponsor", tone: "warn", evidence: "The employer is on the Home Office register of licensed sponsors. This posting does not say whether this role is sponsored." });
  }
  return tags;
}
