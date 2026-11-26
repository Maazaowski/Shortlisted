import { POOLS, type RawListing } from "@shortlisted/core";
import { arr, getJson, getText, htmlToText, HttpError, obj, pool, str } from "../http.js";

/**
 * One function per job board system. Each takes a company's board id and
 * returns its open jobs in the common shape. All of these are public JSON
 * endpoints the systems publish for exactly this purpose: showing a company's
 * jobs somewhere other than the company's own careers page. The link on every
 * listing goes to the employer's own posting.
 */

export type Company = { ats: string; board: string; name: string };
export type Source = (company: Company) => Promise<RawListing[]>;

const iso = (v: unknown): string | null => {
  if (typeof v === "number") return new Date(v).toISOString();
  return str(v);
};

/** https://developers.greenhouse.io/job-board.html */
const greenhouse: Source = async ({ board, name }) => {
  const body = obj(await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`));
  return arr(body.jobs).flatMap((j): RawListing[] => {
    const job = obj(j);
    const url = str(job.absolute_url);
    const title = str(job.title);
    if (!url || !title || job.id == null) return [];
    return [
      {
        source: "greenhouse",
        board,
        sourceId: String(job.id),
        company: name,
        title,
        url,
        location: str(obj(job.location).name),
        description: htmlToText(str(job.content) ?? "", true),
        postedAt: iso(job.first_published) ?? iso(job.updated_at),
      },
    ];
  });
};

/** https://github.com/lever/postings-api */
const lever: Source = async ({ board, name }) => {
  const body = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`);
  return arr(body).flatMap((j): RawListing[] => {
    const job = obj(j);
    const url = str(job.hostedUrl);
    const title = str(job.text);
    const id = str(job.id);
    if (!url || !title || !id) return [];
    const categories = obj(job.categories);
    const lists = arr(job.lists)
      .map((l) => `${str(obj(l).text) ?? ""}\n${htmlToText(str(obj(l).content) ?? "")}`)
      .join("\n\n");
    const description = [str(job.descriptionPlain) ?? htmlToText(str(job.description) ?? ""), lists, str(job.additionalPlain) ?? ""].filter(Boolean).join("\n\n");
    const workplace = str(job.workplaceType);
    return [
      {
        source: "lever",
        board,
        sourceId: id,
        company: name,
        title,
        url,
        location: str(categories.location),
        description,
        postedAt: iso(job.createdAt),
        employmentType: str(categories.commitment),
        hints: { workplace: workplace === "unspecified" ? null : workplace, countryCode: str(job.country) },
      },
    ];
  });
};

/** https://developers.ashbyhq.com/docs/public-job-posting-api */
const ashby: Source = async ({ board, name }) => {
  const body = obj(await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`));
  return arr(body.jobs).flatMap((j): RawListing[] => {
    const job = obj(j);
    const url = str(job.jobUrl);
    const title = str(job.title);
    const id = str(job.id);
    // Unlisted jobs are meant to be reachable by direct link only.
    if (!url || !title || !id || job.isListed === false) return [];
    const country = str(obj(obj(job.address).postalAddress).addressCountry);
    return [
      {
        source: "ashby",
        board,
        sourceId: id,
        company: name,
        title,
        url,
        location: [str(job.location), country && !(str(job.location) ?? "").includes(country) ? country : null].filter(Boolean).join(", ") || null,
        description: str(job.descriptionPlain) ?? htmlToText(str(job.descriptionHtml) ?? ""),
        postedAt: iso(job.publishedAt),
        employmentType: str(job.employmentType),
        // isRemote is true for hybrid roles too, so workplaceType is the one to trust.
        hints: { workplace: str(job.workplaceType) },
      },
    ];
  });
};

/**
 * https://docs.recruitee.com/reference/offers
 * Works without a key until 10 February 2027. After that date Recruitee
 * requires a token only the employer can create, and these boards will fail
 * and be skipped like any other board that stops answering.
 */
const recruitee: Source = async ({ board, name }) => {
  const body = obj(await getJson(`https://${encodeURIComponent(board)}.recruitee.com/api/offers/`));
  return arr(body.offers).flatMap((j): RawListing[] => {
    const job = obj(j);
    const url = str(job.careers_url);
    const title = str(job.title);
    if (!url || !title || job.id == null) return [];
    return [
      {
        source: "recruitee",
        board,
        sourceId: String(job.id),
        company: name,
        title,
        url,
        location: str(job.location) ?? [str(job.city), str(job.country)].filter(Boolean).join(", "),
        description: [htmlToText(str(job.description) ?? ""), htmlToText(str(job.requirements) ?? "")].filter(Boolean).join("\n\n"),
        postedAt: iso(job.published_at) ?? iso(job.created_at),
        employmentType: str(job.employment_type_code),
        hints: { remote: job.remote === true ? true : null, workplace: job.hybrid === true ? "hybrid" : job.on_site === true ? "on-site" : null, countryCode: str(job.country_code) },
      },
    ];
  });
};

/** https://help.workable.com/hc/en-us/articles/115012771647 (the public endpoint for a company's published jobs) */
const workable: Source = async ({ board, name }) => {
  const body = obj(await getJson(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(board)}?details=true`));
  return arr(body.jobs).flatMap((j): RawListing[] => {
    const job = obj(j);
    const url = str(job.url) ?? str(job.shortlink);
    const title = str(job.title);
    const id = str(job.shortcode);
    if (!url || !title || !id) return [];
    return [
      {
        source: "workable",
        board,
        sourceId: id,
        company: name,
        title,
        url,
        location: [str(job.city), str(job.state), str(job.country)].filter(Boolean).join(", ") || null,
        description: htmlToText(str(job.description) ?? ""),
        postedAt: iso(job.published_on) ?? iso(job.created_at),
        employmentType: str(job.employment_type),
        hints: { remote: job.telecommuting === true ? true : null, countryCode: str(obj(arr(job.locations)[0]).countryCode) },
      },
    ];
  });
};

const GULF = new Set<string>(POOLS.find((p) => p.id === "gulf")?.countries ?? []);
const SR_PAGE = 100;
/** A company with more open jobs than this is read up to here. */
const SR_MAX_LISTED = 6000;
/** One request per job for its description, so this is the daily cost ceiling per company. */
const SR_MAX_DETAILS = 400;

/**
 * https://developers.smartrecruiters.com/docs/posting-api
 * The list has no description, and the description costs one request per job.
 * So only the jobs the list already shows could belong to a pool are read in
 * full: remote ones, office roles in a Gulf country, and roles in the UK (for
 * the licensed sponsor tag). A role elsewhere that states visa sponsorship in
 * its text is missed. An unknown company answers with an empty list, not a 404.
 */
const smartrecruiters: Source = async ({ board, name }) => {
  const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board)}/postings`;
  const listed: Record<string, unknown>[] = [];
  for (let offset = 0; offset < SR_MAX_LISTED; offset += SR_PAGE) {
    const page = arr(obj(await getJson(`${base}?limit=${SR_PAGE}&offset=${offset}`)).content).map(obj);
    listed.push(...page);
    if (page.length < SR_PAGE) break;
  }
  const wanted = listed
    .filter((job) => {
      const loc = obj(job.location);
      const country = (str(loc.country) ?? "").toUpperCase();
      return loc.remote === true || GULF.has(country) || country === "GB";
    })
    .slice(0, SR_MAX_DETAILS);

  const details = await pool(wanted, 4, async (job) => obj(await getJson(`${base}/${encodeURIComponent(String(job.id))}`)));
  return wanted.flatMap((job, i): RawListing[] => {
    const result = details[i];
    const id = str(job.id);
    const title = str(job.name);
    // A job whose description could not be read is left out today and tried again tomorrow.
    if (!result?.ok || !id || !title) return [];
    const detail = result.value;
    const loc = obj(job.location);
    const sections = obj(obj(detail.jobAd).sections);
    const description = ["companyDescription", "jobDescription", "qualifications", "additionalInformation"]
      .map((key) => htmlToText(str(obj(sections[key]).text) ?? ""))
      .filter(Boolean)
      .join("\n\n");
    const place = [str(loc.city), str(loc.region), str(loc.country)?.toUpperCase()].filter(Boolean).join(", ");
    return [
      {
        source: "smartrecruiters",
        board,
        sourceId: id,
        company: name,
        title,
        url: str(detail.postingUrl) ?? `https://jobs.smartrecruiters.com/${encodeURIComponent(board)}/${encodeURIComponent(id)}`,
        location: place || null,
        description,
        postedAt: iso(job.releasedDate),
        employmentType: str(obj(job.typeOfEmployment).label),
        hints: { remote: loc.remote === true ? true : null, workplace: loc.hybrid === true ? "hybrid" : null, countryCode: str(loc.country)?.toUpperCase() ?? null },
      },
    ];
  });
};

const xmlText = (s: string): string =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
const xmlTag = (xml: string, tag: string): string | null => {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m?.[1] ? xmlText(m[1]) || null : null;
};
const xmlBlocks = (xml: string, tag: string): string[] => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1] ?? "");

/**
 * https://developer.personio.de/docs/retrieving-open-job-positions
 * The XML feed Personio publishes for showing a company's open positions on
 * its own site. The file is flat and regular, so it is read with a few
 * patterns and needs no XML library. Most accounts live on jobs.personio.de,
 * some on jobs.personio.com; both are tried.
 */
const personio: Source = ({ board, name }) => {
  // Personio limits requests per caller across all its career pages, so companies are read one after another.
  const turn = personioQueue.then(() => readPersonio(board, name));
  personioQueue = turn.then(
    () => new Promise<void>((r) => setTimeout(r, PERSONIO_GAP_MS)),
    () => new Promise<void>((r) => setTimeout(r, PERSONIO_GAP_MS)),
  );
  return turn;
};
const PERSONIO_GAP_MS = 1500;
let personioQueue: Promise<void> = Promise.resolve();

async function readPersonio(board: string, name: string): Promise<RawListing[]> {
  let host = `${encodeURIComponent(board)}.jobs.personio.de`;
  let xml: string;
  try {
    xml = await getText(`https://${host}/xml?language=en`);
  } catch (err) {
    if (!(err instanceof HttpError) || err.status !== 404) throw err;
    host = `${encodeURIComponent(board)}.jobs.personio.com`;
    xml = await getText(`https://${host}/xml?language=en`);
  }
  if (!xml.includes("<workzag-jobs")) throw new Error(`no job feed at ${host}`);
  const describe = (position: string): string =>
    xmlBlocks(position, "jobDescription")
      .map((part) => [xmlTag(part, "name"), htmlToText(xmlTag(part, "value") ?? "")].filter(Boolean).join("\n"))
      .filter(Boolean)
      .join("\n\n");
  const idOf = (position: string): string | null => xmlTag(position.split("<jobDescriptions>")[0] ?? position, "id");

  // A posting written only in German has an empty description in the English feed.
  const positions = xmlBlocks(xml, "position");
  const german = new Map<string, string>();
  if (positions.some((p) => !describe(p))) {
    try {
      for (const p of xmlBlocks(await getText(`https://${host}/xml?language=de`), "position")) {
        const id = idOf(p);
        if (id) german.set(id, describe(p));
      }
    } catch {
      // The English feed alone is still worth having.
    }
  }

  return positions.flatMap((position): RawListing[] => {
    // The first <id> and <name> are the position's own; job description parts have a <name> too.
    const head = position.split("<jobDescriptions>")[0] ?? position;
    const id = xmlTag(head, "id");
    const title = xmlTag(head, "name");
    if (!id || !title) return [];
    const offices = [xmlTag(head, "office"), ...xmlBlocks(xmlTag(position, "additionalOffices") ?? "", "office").map(xmlText)].filter((o): o is string => Boolean(o));
    const description = describe(position) || german.get(id) || "";
    return [
      {
        source: "personio",
        board,
        sourceId: id,
        company: name,
        title,
        url: `https://${host}/job/${encodeURIComponent(id)}?language=en`,
        location: [...new Set(offices)].join("; ") || null,
        description,
        postedAt: iso(xmlTag(head, "createdAt")),
        employmentType: xmlTag(head, "schedule") ?? xmlTag(head, "employmentType"),
        hints: { remote: offices.some((o) => /\bremote\b/i.test(o)) ? true : null },
      },
    ];
  });
}

export const SOURCES: Record<string, Source> = { greenhouse, lever, ashby, recruitee, workable, smartrecruiters, personio };
