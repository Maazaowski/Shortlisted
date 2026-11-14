import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { classifyListing, FEED_FAMILIES, FEED_VERSION, FeedListingSchema, FeedMetaSchema, type FeedFamily, type FeedListing, type FeedMeta, type RawListing } from "@shortlisted/core";
import { loadCompanies } from "./companies.js";
import { pool } from "./http.js";
import { SOURCES, type Company } from "./sources/index.js";
import { loadUkSponsors, normalizeCompanyName, UK_REGISTER_ATTRIBUTION } from "./sponsors.js";

/**
 * Builds the shared job feed.
 *
 *   pnpm --filter @shortlisted/feed build-feed -- --out out [--prev prev] [--only gitlab,careem] [--no-sponsors]
 *
 * Reads companies.yaml, fetches every board, classifies each job with the
 * rules in @shortlisted/core, keeps the ones that belong to a pool, and writes
 * one gzipped NDJSON file per pool family plus meta.json. --prev points at the
 * last build's output so `firstSeenAt` survives from day to day.
 *
 * A board that fails is reported and skipped. The build only fails when so
 * many boards fail that publishing would wipe most of the feed.
 */

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? "");
}
const has = (name: string) => process.argv.includes(`--${name}`);

const outDir = resolve(flag("out") ?? "out");
const prevDir = flag("prev") ? resolve(flag("prev") as string) : null;
const only = flag("only")
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const CONCURRENCY = 6;
/** Publishing with fewer boards than this share answering would look like a mass closure to every install. */
const MIN_BOARD_SHARE = 0.6;

function readPrevious(dir: string): Map<string, string> {
  const seen = new Map<string, string>();
  if (!existsSync(dir)) return seen;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ndjson.gz"))) {
    for (const line of gunzipSync(readFileSync(join(dir, file))).toString("utf8").split("\n")) {
      if (!line) continue;
      try {
        const row = JSON.parse(line) as { id?: unknown; firstSeenAt?: unknown };
        if (typeof row.id === "string" && typeof row.firstSeenAt === "string") seen.set(row.id, row.firstSeenAt);
      } catch {
        // A damaged line in yesterday's feed costs one listing its first-seen date, nothing more.
      }
    }
  }
  return seen;
}

const companies: Company[] = loadCompanies().filter((c) => !only || only.includes(c.board));
if (companies.length === 0) throw new Error("No companies to fetch. Check --only against companies.yaml.");

const now = new Date().toISOString();
const previous = prevDir ? readPrevious(prevDir) : new Map<string, string>();
console.log(`Fetching ${companies.length} boards. ${previous.size} listings known from the previous build.`);

let ukSponsors = new Set<string>();
let sponsorsLoaded = false;
if (!has("no-sponsors")) {
  try {
    ukSponsors = await loadUkSponsors();
    sponsorsLoaded = true;
    console.log(`UK sponsor register: ${ukSponsors.size} organisations.`);
  } catch (err) {
    console.warn(`UK sponsor register skipped: ${(err as Error).message}`);
  }
}

const fetched = await pool(companies, CONCURRENCY, async (c): Promise<RawListing[]> => {
  const source = SOURCES[c.ats];
  if (!source) throw new Error(`unknown ats ${c.ats}`);
  return source(c);
});

const listings = new Map<string, FeedListing>();
const duplicates = new Set<string>();
let answered = 0;
let rawCount = 0;
fetched.forEach((result, i) => {
  const c = companies[i];
  if (!c) return;
  if (!result.ok) {
    console.warn(`  skipped ${c.ats}:${c.board} (${result.error.message})`);
    return;
  }
  answered++;
  rawCount += result.value.length;
  const licensedSponsor = ukSponsors.has(normalizeCompanyName(c.name)) ? ["GB"] : [];
  let kept = 0;
  for (const raw of result.value) {
    const id = `${raw.source}:${raw.board}:${raw.sourceId}`;
    const listing = classifyListing(raw, { firstSeenAt: previous.get(id) ?? now, licensedSponsor });
    if (!listing) continue;
    // The same job posted once per city is one listing per city. The same job twice in one place is a duplicate.
    const twin = `${listing.company}|${listing.title}|${listing.location ?? ""}`.toLowerCase();
    if (duplicates.has(twin)) continue;
    duplicates.add(twin);
    listings.set(listing.id, listing);
    kept++;
  }
  console.log(`  ${c.ats}:${c.board}  ${result.value.length} open, ${kept} kept`);
});

if (answered / companies.length < MIN_BOARD_SHARE) {
  throw new Error(`Only ${answered} of ${companies.length} boards answered. Not publishing a feed this thin.`);
}

mkdirSync(outDir, { recursive: true });
const all = [...listings.values()].sort((a, b) => (b.postedAt ?? b.firstSeenAt).localeCompare(a.postedAt ?? a.firstSeenAt));
const files: FeedMeta["files"] = [];
for (const family of FEED_FAMILIES as readonly FeedFamily[]) {
  const rows = all.filter((l) => l.families.includes(family));
  const name = `${family}.ndjson.gz`;
  writeFileSync(join(outDir, name), gzipSync(rows.map((r) => JSON.stringify(FeedListingSchema.parse(r))).join("\n") + (rows.length ? "\n" : "")));
  files.push({ family, name, listings: rows.length });
}

const meta: FeedMeta = FeedMetaSchema.parse({
  version: FEED_VERSION,
  builtAt: now,
  counts: { listings: all.length, companies: new Set(all.map((l) => l.company)).size, fields: new Set(all.map((l) => l.field)).size },
  files,
  attribution: sponsorsLoaded ? [UK_REGISTER_ATTRIBUTION] : [],
});
writeFileSync(join(outDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);

console.log(`\n${answered} of ${companies.length} boards answered. ${rawCount} open jobs, ${all.length} kept.`);
for (const f of files) console.log(`  ${f.family.padEnd(9)} ${f.listings}`);
console.log(`Written to ${outDir}`);
