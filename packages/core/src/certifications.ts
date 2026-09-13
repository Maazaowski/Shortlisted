import type { Certification, Education } from "./schemas.js";

/**
 * Education and certifications are edited on the bank page as one line per
 * item with fields separated by " | ", the same way links and skill groups are
 * one line each. These helpers go both ways so the page stays a plain form.
 */

const SEP = " | ";

function cell(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function cells(line: string): string[] {
  return line.split("|").map((c) => c.trim());
}

function orNull(s: string | undefined): string | null {
  return s && s !== "" ? s : null;
}

/** A short id a pasted reply cannot mangle and a form can carry. */
export function newCertificationId(): string {
  return "c_" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export const EDUCATION_LINE_HINT =
  "One per line: Degree | Field | Institution | Start | End | GPA | Honours. Leave a field blank to skip it.";
export const CERTIFICATION_LINE_HINT =
  "One per line: Name | Issuer | Date | URL. Dates are YYYY-MM or YYYY.";

export function formatEducationLines(items: Education[]): string {
  return items
    .map((e) =>
      [e.degree, e.field, e.institution, e.start, e.end, e.gpa, e.honors]
        .map(cell)
        .join(SEP)
        .replace(/( \|\s*)+$/, ""),
    )
    .join("\n");
}

export function parseEducationLines(text: string): Education[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [degree, field, institution, start, end, gpa, honors] = cells(line);
      return {
        degree: degree ?? "",
        field: orNull(field),
        institution: institution ?? "",
        start: orNull(start),
        end: orNull(end),
        gpa: orNull(gpa),
        honors: orNull(honors),
      };
    })
    .filter((e) => e.degree !== "" || e.institution !== "");
}

export function formatCertificationLines(items: Certification[]): string {
  return items
    .map((c) =>
      [c.name, c.issuer, c.date, c.url]
        .map(cell)
        .join(SEP)
        .replace(/( \|\s*)+$/, ""),
    )
    .join("\n");
}

/**
 * Parses the textarea back into certifications. A line whose name matches an
 * existing certification keeps its id, so stored selections that cite it stay
 * valid after an edit to its issuer or date.
 */
export function parseCertificationLines(
  text: string,
  existing: Certification[],
): Certification[] {
  const byName = new Map(
    existing.map((c) => [c.name.trim().toLowerCase(), c.id]),
  );
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, issuer, date, url] = cells(line);
      const key = (name ?? "").toLowerCase();
      return {
        id: byName.get(key) ?? newCertificationId(),
        name: name ?? "",
        issuer: orNull(issuer),
        date: orNull(date),
        url: orNull(url),
      };
    })
    .filter((c) => c.name !== "");
}
