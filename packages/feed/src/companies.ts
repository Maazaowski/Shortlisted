import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SOURCES, type Company } from "./sources/index.js";

export const COMPANIES_FILE = fileURLToPath(new URL("../companies.yaml", import.meta.url));

/**
 * Reads companies.yaml. The file is a flat list, one company per line:
 *
 *   - { ats: greenhouse, board: gitlab, name: GitLab }
 *
 * so it is parsed line by line here and needs no YAML library. Lines that are
 * blank or start with # are skipped. Anything else that does not fit is an
 * error with its line number, so a bad pull request fails loudly.
 */
export function parseCompanies(text: string): Company[] {
  const out: Company[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = /^-\s*\{(.+)\}\s*(#.*)?$/.exec(line);
    if (!m?.[1]) throw new Error(`companies.yaml line ${i + 1}: expected "- { ats: ..., board: ..., name: ... }"`);
    const fields: Record<string, string> = {};
    for (const part of m[1].split(",")) {
      const at = part.indexOf(":");
      if (at === -1) throw new Error(`companies.yaml line ${i + 1}: "${part.trim()}" has no colon`);
      fields[part.slice(0, at).trim()] = part
        .slice(at + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
    const { ats, board, name } = fields;
    if (!ats || !board || !name) throw new Error(`companies.yaml line ${i + 1}: ats, board and name are all required`);
    if (!SOURCES[ats]) throw new Error(`companies.yaml line ${i + 1}: unknown ats "${ats}". Known: ${Object.keys(SOURCES).join(", ")}`);
    const key = `${ats}:${board}`;
    if (seen.has(key)) throw new Error(`companies.yaml line ${i + 1}: ${key} is listed twice`);
    seen.add(key);
    out.push({ ats, board, name });
  });
  return out;
}

export function loadCompanies(): Company[] {
  return parseCompanies(readFileSync(COMPANIES_FILE, "utf8"));
}
