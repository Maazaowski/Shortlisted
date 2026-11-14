import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { admitCodes, DEFAULT_FEED_URL, FEED_VERSION, FeedMetaSchema, parseFeedLines, type FeedListing } from "@shortlisted/core";
import { Prisma, withUser } from "@shortlisted/db";

/**
 * Brings this install's listings in line with the shared feed: new rows are
 * added, changed rows rewritten, rows the feed no longer carries are marked
 * closed (not deleted, so a saved or applied-to listing keeps its page), and a
 * closed row that comes back is reopened. What the user did with a listing
 * (saved, hidden, the linked application) is never touched.
 *
 * The feed address is SHORTLISTED_FEED_URL, then Settings, then the default.
 * A file:// address reads a local build, for development.
 */

export class FeedError extends Error {}

async function read(base: string, name: string): Promise<Buffer> {
  const url = `${base.replace(/\/+$/, "")}/${name}`;
  if (url.startsWith("file:")) return readFile(fileURLToPath(url));
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": "shortlisted" }, signal: AbortSignal.timeout(120_000) });
  } catch {
    throw new FeedError("The job feed could not be reached. Check the internet connection.");
  }
  if (res.status === 404) throw new FeedError("The job feed has not been published at that address yet.");
  if (!res.ok) throw new FeedError(`The job feed answered with an error (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

function row(userId: string, l: FeedListing, feedHash: string) {
  return {
    userId,
    feedId: l.id,
    feedHash,
    source: l.source,
    company: l.company,
    title: l.title,
    url: l.url,
    location: l.location,
    mode: l.remote.mode,
    remote: l.remote as Prisma.InputJsonValue,
    admits: admitCodes(l.remote),
    countries: l.remote.countries,
    sponsorship: l.sponsorship as Prisma.InputJsonValue,
    licensedSponsor: l.licensedSponsor,
    field: l.field,
    skills: l.skills,
    description: l.description,
    employmentType: l.employmentType,
    families: l.families,
    postedAt: l.postedAt ? new Date(l.postedAt) : null,
    firstSeenAt: new Date(l.firstSeenAt),
    closedAt: null,
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type SyncResult = { added: number; changed: number; closed: number; total: number; skipped: number };

async function run(userId: string): Promise<SyncResult & { builtAt: Date; attribution: Prisma.InputJsonValue }> {
  const stored = await withUser(userId, (tx) => tx.preferences.findUnique({ where: { userId }, select: { feedUrl: true } }));
  const base = process.env.SHORTLISTED_FEED_URL?.trim() || stored?.feedUrl || DEFAULT_FEED_URL;

  let meta;
  try {
    meta = FeedMetaSchema.parse(JSON.parse((await read(base, "meta.json")).toString("utf8")));
  } catch (err) {
    if (err instanceof FeedError) throw err;
    throw new FeedError("The job feed's summary file could not be read.");
  }
  if (meta.version > FEED_VERSION) throw new FeedError("The job feed is newer than this version of Shortlisted. Update Shortlisted to read it.");

  const incoming = new Map<string, FeedListing>();
  let skipped = 0;
  for (const file of meta.files) {
    const parsed = parseFeedLines(gunzipSync(await read(base, file.name)).toString("utf8"));
    skipped += parsed.skipped;
    for (const l of parsed.listings) incoming.set(l.id, l);
  }
  // An empty feed is far more likely a broken build than every job closing on one day.
  if (incoming.size === 0) throw new FeedError("The job feed is empty. Keeping the listings already here.");

  const existing = await withUser(userId, (tx) => tx.listing.findMany({ where: { userId }, select: { id: true, feedId: true, feedHash: true, closedAt: true } }));
  const known = new Map(existing.map((e) => [e.feedId, e]));

  const creates: ReturnType<typeof row>[] = [];
  const updates: { id: string; data: ReturnType<typeof row> & { parsed?: typeof Prisma.DbNull } }[] = [];
  for (const l of incoming.values()) {
    const feedHash = createHash("sha1").update(JSON.stringify(l)).digest("hex");
    const have = known.get(l.id);
    if (!have) creates.push(row(userId, l, feedHash));
    // A changed posting may ask for different things, so its parsed requirements go. A reopened one keeps them.
    else if (have.feedHash !== feedHash) updates.push({ id: have.id, data: { ...row(userId, l, feedHash), parsed: Prisma.DbNull } });
    else if (have.closedAt) updates.push({ id: have.id, data: row(userId, l, feedHash) });
  }
  const gone = existing.filter((e) => !e.closedAt && !incoming.has(e.feedId)).map((e) => e.id);

  for (const batch of chunks(creates, 500)) await withUser(userId, (tx) => tx.listing.createMany({ data: batch, skipDuplicates: true }));
  for (const batch of chunks(updates, 100)) {
    await withUser(userId, async (tx) => {
      for (const u of batch) await tx.listing.update({ where: { id: u.id }, data: u.data });
    });
  }
  const now = new Date();
  for (const batch of chunks(gone, 1000)) await withUser(userId, (tx) => tx.listing.updateMany({ where: { userId, id: { in: batch } }, data: { closedAt: now } }));

  return { added: creates.length, changed: updates.length, closed: gone.length, total: incoming.size, skipped, builtAt: new Date(meta.builtAt), attribution: meta.attribution as Prisma.InputJsonValue };
}

/** Never throws: a failed sync is recorded as a sentence for the jobs page and the old listings stay. */
export async function syncFeed(userId: string): Promise<SyncResult | null> {
  const attemptedAt = new Date();
  try {
    const { builtAt, attribution, ...result } = await run(userId);
    const data = { syncedAt: new Date(), builtAt, attribution, lastError: null, attemptedAt };
    await withUser(userId, (tx) => tx.feedSync.upsert({ where: { userId }, create: { userId, ...data }, update: data }));
    return result;
  } catch (err) {
    const lastError = err instanceof FeedError ? err.message : `The job feed could not be read: ${(err as Error).message}`;
    await withUser(userId, (tx) => tx.feedSync.upsert({ where: { userId }, create: { userId, lastError, attemptedAt }, update: { lastError, attemptedAt } }));
    console.error("[feed-sync]", lastError);
    return null;
  }
}
