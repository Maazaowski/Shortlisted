import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { classifyListing, FEED_FAMILIES, FEED_VERSION, FeedListingSchema, FeedMetaSchema, type FeedListing, type RawListing } from "@shortlisted/core";

/**
 * A small job feed written to disk in the same format the daily build
 * publishes. Each raw posting goes through the real classifier, so the tests
 * see what a user would see for a posting worded this way.
 */

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

function raw(sourceId: string, company: string, title: string, location: string | null, description: string, postedDaysAgo: number): RawListing {
  return {
    source: "greenhouse",
    board: company.toLowerCase().replace(/[^a-z0-9]+/g, ""),
    sourceId,
    company,
    title,
    url: `https://jobs.example.com/${company.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/${sourceId}`,
    location,
    description,
    postedAt: daysAgo(postedDaysAgo),
  };
}

export const RAW_LISTINGS: RawListing[] = [
  raw(
    "1001",
    "Ledgerly",
    "Senior Backend Engineer",
    "Remote",
    "Title: Senior Backend Engineer\nCompany: Ledgerly\nLocation: Remote\n\nLedgerly builds accounting software for small businesses. This role is fully remote and we hire anywhere in the world.\n\nMust have: Postgres, TypeScript, Node, Docker.\nNice to have: Kubernetes, AWS.\n\nYou will own the ledger service and mentor engineers.",
    1,
  ),
  raw(
    "1002",
    "Statewide Labs",
    "Frontend Engineer",
    "Remote, United States",
    "Title: Frontend Engineer\nCompany: Statewide Labs\n\nThis is a remote role. You must be based in the United States and authorized to work in the US.\n\nMust have: React, TypeScript.\nNice to have: Next.js.",
    2,
  ),
  raw(
    "1003",
    "Meridian Health",
    "Data Analyst",
    "Remote, EMEA",
    "Title: Data Analyst\nCompany: Meridian Health\n\nRemote within EMEA time zones. You will build dashboards in SQL and Python for our clinical teams.\n\nMust have: SQL, Python.\nNice to have: Tableau.",
    3,
  ),
  raw(
    "1004",
    "Brightline",
    "Product Designer",
    "Remote",
    "Title: Product Designer\nCompany: Brightline\n\nWe are a remote team. You will design the mobile app in Figma and run user research.\n\nMust have: Figma.\nNice to have: User research.",
    4,
  ),
  raw(
    "1005",
    "Kranz Mobility",
    "Platform Engineer",
    "Berlin, Germany",
    "Title: Platform Engineer\nCompany: Kranz Mobility\nLocation: Berlin, Germany\n\nJoin our platform team in Berlin. We offer visa sponsorship and a relocation package for candidates moving to Germany.\n\nMust have: Kubernetes, Go, Terraform.\nNice to have: AWS.",
    5,
  ),
  raw(
    "1006",
    "Dune Logistics",
    "Finance Manager",
    "Dubai, United Arab Emirates",
    "Title: Finance Manager\nCompany: Dune Logistics\nLocation: Dubai, United Arab Emirates\n\nLead month end close and reporting for our Dubai office. This role is based on site.\n\nMust have: Excel, IFRS.\nNice to have: SAP.",
    6,
  ),
  raw(
    "1007",
    "Najd Systems",
    "Software Engineer",
    "Riyadh, Saudi Arabia",
    "Title: Software Engineer\nCompany: Najd Systems\nLocation: Riyadh, Saudi Arabia\n\nBuild payment services in Java for our Riyadh office. Visa sponsorship is provided for the successful candidate.\n\nMust have: Java, Spring, Postgres.\nNice to have: Kafka.",
    7,
  ),
  raw(
    "1008",
    "Oldfield Software",
    "Backend Engineer",
    "Remote",
    "Title: Backend Engineer\nCompany: Oldfield Software\n\nA remote role on a small team. You will keep our Node services running.\n\nMust have: Node, Postgres.\nNice to have: Redis.",
    70,
  ),
  raw(
    "1009",
    "Harbour Bank",
    "Site Reliability Engineer",
    "London, United Kingdom",
    "Title: Site Reliability Engineer\nCompany: Harbour Bank\n\nBased in our London office. We are unable to sponsor visas for this role.\n\nMust have: Linux, Kubernetes.",
    2,
  ),
  raw(
    "1010",
    "Lahore Cloud",
    "Customer Support Specialist",
    "Remote, Pakistan",
    "Title: Customer Support Specialist\nCompany: Lahore Cloud\n\nRemote role for candidates based in Pakistan. You will answer customer tickets by email and chat.\n\nMust have: Zendesk.",
    1,
  ),
];

export function buildFeedListings(): FeedListing[] {
  const out: FeedListing[] = [];
  for (const r of RAW_LISTINGS) {
    const listing = classifyListing(r, { firstSeenAt: r.postedAt ?? new Date().toISOString() });
    if (listing) out.push(listing);
  }
  return out;
}

/** Writes meta.json and one gzipped file per family. Pass a subset to simulate a later build. */
export function writeFeed(dir: string, listings: FeedListing[] = buildFeedListings()): FeedListing[] {
  mkdirSync(dir, { recursive: true });
  const files = FEED_FAMILIES.map((family) => {
    const rows = listings.filter((l) => l.families.includes(family));
    const name = `${family}.ndjson.gz`;
    writeFileSync(path.join(dir, name), gzipSync(rows.map((r) => JSON.stringify(FeedListingSchema.parse(r))).join("\n") + (rows.length ? "\n" : "")));
    return { family, name, listings: rows.length };
  });
  const meta = FeedMetaSchema.parse({
    version: FEED_VERSION,
    builtAt: new Date().toISOString(),
    counts: { listings: listings.length, companies: new Set(listings.map((l) => l.company)).size, fields: new Set(listings.map((l) => l.field)).size },
    files,
    attribution: [],
  });
  writeFileSync(path.join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  return listings;
}
