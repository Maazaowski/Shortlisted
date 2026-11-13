import { arr, getJson, getText, obj, str } from "./http.js";

/**
 * The UK Home Office register of licensed sponsors (workers): every employer
 * allowed to sponsor a Skilled Worker visa. Published as a CSV under the Open
 * Government Licence v3.0 and updated most working days. An employer on it
 * gets a "licensed sponsor" tag on its UK roles. That is a fact about the
 * employer, not a promise about one job, and the UI must say so.
 */
const CONTENT_API = "https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers";

export const UK_REGISTER_ATTRIBUTION = {
  source: "uk-sponsor-register",
  name: "Register of licensed sponsors: workers, Home Office. Contains public sector information licensed under the Open Government Licence v3.0.",
  url: "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers",
};

const SUFFIXES = /\b(ltd|limited|plc|llp|llc|inc|incorporated|corp|corporation|co|company|uk|gb|group|holdings|international|the|t\/a)\b/g;

/** "Monzo Bank Limited" and "Monzo Bank Ltd." compare equal. Deliberately strict otherwise: a wrong tag is worse than a missing one. */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first field of each CSV line, honouring quotes. The organisation name is the first column. */
function firstColumn(line: string): string {
  if (!line.startsWith('"')) return line.slice(0, line.indexOf(",") === -1 ? undefined : line.indexOf(","));
  let out = "";
  for (let i = 1; i < line.length; i++) {
    if (line[i] === '"') {
      if (line[i + 1] === '"') {
        out += '"';
        i++;
      } else break;
    } else out += line[i];
  }
  return out;
}

/** Normalised names of every organisation licensed for the Skilled Worker route. Empty when the register cannot be read. */
export async function loadUkSponsors(): Promise<Set<string>> {
  const content = obj(await getJson(CONTENT_API));
  const attachment = arr(obj(content.details).attachments)
    .map(obj)
    .find((a) => str(a.content_type) === "text/csv" || (str(a.url) ?? "").endsWith(".csv"));
  const url = str(attachment?.url);
  if (!url || !url.startsWith("https://assets.publishing.service.gov.uk/")) throw new Error("the register's CSV link was not found");

  const names = new Set<string>();
  const lines = (await getText(url, 120_000)).split(/\r?\n/);
  if (!/^"?Organisation Name/i.test(lines[0] ?? "")) throw new Error("the register's columns have changed");
  for (const line of lines.slice(1)) {
    if (!/Skilled Worker/i.test(line)) continue;
    const name = normalizeCompanyName(firstColumn(line));
    if (name.length >= 3) names.add(name);
  }
  return names;
}
