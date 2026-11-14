import type { RawListing } from "@shortlisted/core";
import { arr, getJson, htmlToText, obj, str } from "../http.js";

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

export const SOURCES: Record<string, Source> = { greenhouse, lever, ashby, recruitee, workable };
