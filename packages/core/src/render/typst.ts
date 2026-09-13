import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Bank, Education, Selection } from "../schemas.js";
import { bulletIndex } from "../validate.js";

const execFileAsync = promisify(execFile);

/**
 * Bundled fonts, next to `src` and `dist`. Typst is pointed at this directory
 * only. Resolved on demand: the web app bundles this module and rewrites
 * `import.meta`, but only the worker ever compiles.
 */
export function fontDir(): string {
  return path.resolve(import.meta.dirname, "../../fonts");
}

/** Escape text for Typst markup. */
export function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/([#$*_`<>@\[\]])/g, "\\$1");
}

/** Escape text for a Typst string literal. */
function str(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-05" becomes "May 2026"; "2020" stays "2020"; anything else is returned as is. */
export function formatMonth(s: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return s;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : s;
}

export function dateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  if (!start) return formatMonth(end!);
  return `${formatMonth(start)} – ${end ? formatMonth(end) : "Present"}`;
}

// ---------------------------------------------------------------------------
// Look. Dark slate ink, a serif for everything, hairline rules, one accent for
// links. Single column so parsers read it top to bottom.
// ---------------------------------------------------------------------------

const INK = "#2e3d50";
const MUTED = "#5b6779";
const RULE = "#d9dfe7";
const ACCENT = "#1d5fa8";

const svg = (body: string) =>
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${INK}' stroke-width='2.25' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`;

/** Lucide icons, the same set the web app uses. */
const ICONS = {
  pin: svg(
    `<path d='M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'/><circle cx='12' cy='10' r='3'/>`,
  ),
  mail: svg(
    `<rect width='20' height='16' x='2' y='4' rx='2'/><path d='m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'/>`,
  ),
  phone: svg(
    `<path d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'/>`,
  ),
  linkedin: svg(
    `<path d='M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z'/><rect width='4' height='12' x='2' y='9'/><circle cx='4' cy='4' r='2'/>`,
  ),
  github: svg(
    `<path d='M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4'/><path d='M9 18c-4.51 2-5-2-7-2'/>`,
  ),
  globe: svg(
    `<circle cx='12' cy='12' r='10'/><path d='M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20'/><path d='M2 12h20'/>`,
  ),
};

/** Short display form of a profile link, with the icon that fits its host. */
function linkItem(url: string): { icon: keyof typeof ICONS; label: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const p = u.pathname.replace(/\/+$/, "");
    if (host.endsWith("linkedin.com"))
      return {
        icon: "linkedin",
        label: "in/" + (p.split("/").filter(Boolean).pop() ?? ""),
      };
    if (host.endsWith("github.com")) return { icon: "github", label: host + p };
    return { icon: "globe", label: host + p };
  } catch {
    return { icon: "globe", label: url };
  }
}

function preamble(fontSize: string): string[] {
  return [
    `#let ink = rgb(${str(INK)})`,
    `#let muted = rgb(${str(MUTED)})`,
    `#let rule = rgb(${str(RULE)})`,
    `#let accent = rgb(${str(ACCENT)})`,
    `#set page(paper: "us-letter", margin: (x: 0.6in, top: 0.5in, bottom: 0.55in))`,
    `#set text(font: ("Merriweather", "Libertinus Serif"), size: ${fontSize}, fill: ink, hyphenate: false)`,
    `#set par(justify: false, leading: 0.82em, spacing: 0.85em)`,
    `#show link: set text(fill: accent)`,
    `#let icon(src) = box(height: 0.8em, baseline: 12%, image(bytes(src), format: "svg", height: 0.8em))`,
    `#let item(src, body) = box[#icon(src)#h(0.32em)#body]`,
    `#show heading.where(level: 1): it => block(above: 1.7em, below: 0.9em, width: 100%, sticky: true)[#line(length: 100%, stroke: 0.6pt + rule)#v(0.8em)#box(width: 100%, inset: (bottom: 0.35em), stroke: (bottom: 0.7pt + ink))[#text(size: 10.5pt, weight: "bold", tracking: 0.04em)[#upper(it.body)]]]`,
    `#set list(marker: text(fill: muted)[·], indent: 0.15em, body-indent: 0.45em, spacing: 0.65em)`,
  ];
}

/** Name, headline and contact line, centred, shared by both documents. */
function header(bank: Bank, headline: string | null): string[] {
  const items: string[] = [];
  if (bank.location)
    items.push(`#item(${str(ICONS.pin)})[${esc(bank.location)}]`);
  items.push(
    `#item(${str(ICONS.mail)})[#link(${str("mailto:" + bank.email)})[#text(fill: ink)[${esc(bank.email)}]]]`,
  );
  if (bank.phone) items.push(`#item(${str(ICONS.phone)})[${esc(bank.phone)}]`);
  for (const l of bank.links) {
    const { icon, label } = linkItem(l.url);
    items.push(
      `#item(${str(ICONS[icon])})[#link(${str(l.url)})[#text(fill: ink)[${esc(label)}]]]`,
    );
  }
  const lines = [
    `#align(center)[`,
    `#text(size: 16pt, weight: "bold", tracking: 0.07em)[${esc(bank.fullName.toUpperCase())}]`,
  ];
  if (headline) {
    lines.push(`#v(-0.05em)`);
    lines.push(`#text(size: 10.5pt, tracking: 0.04em)[${esc(headline)}]`);
  }
  lines.push(`#v(-0.15em)`);
  lines.push(`#text(size: 8pt)[${items.join("#h(1.1em)")}]`);
  lines.push(`]`);
  return lines;
}

/** Right-hand meta for a role: bold dates, then the location after a dot. */
function roleMeta(dates: string, location: string | null): string {
  const parts: string[] = [];
  if (dates) parts.push(`#text(weight: "bold")[${esc(dates)}]`);
  if (location) parts.push(esc(location));
  return `#text(size: 8.2pt)[${parts.join("#h(0.5em)#text(fill: muted)[·]#h(0.5em)")}]`;
}

function twoColumn(left: string, right: string): string {
  return `#grid(columns: (1fr, auto), align: (left, right), column-gutter: 1.2em, [${left}], [${right}])`;
}

function metaLine(parts: string[]): string {
  return `#text(size: 8.4pt)[${parts.join("#h(0.5em)·#h(0.5em)")}]`;
}

/**
 * One fixed template, single column. Parsers read it and the user never checks
 * layout. Roles are grouped under their organisation: the company name leads,
 * each title sits under it with its dates, and a hairline runs down the left.
 */
export function buildResumeTypst(bank: Bank, selection: Selection): string {
  const idx = bulletIndex(bank);
  const lines: string[] = [
    ...preamble("9.2pt"),
    "",
    ...header(bank, selection.headline),
    "",
  ];

  type Entry = Selection["entries"][number];
  const bullets = (se: Entry) => {
    for (const b of se.bullets) {
      const text = b.rewording ?? idx.get(b.id)?.bullet.text ?? "";
      lines.push(`- ${esc(text)}`);
    }
  };
  const entryOf = (se: Entry) => bank.entries.find((e) => e.id === se.entryId);

  lines.push(`= Summary`);
  lines.push(esc(selection.summary));
  lines.push("");

  if (selection.skillGroups.length > 0) {
    lines.push(`= Skills`);
    lines.push(`#block[#set par(spacing: 1.05em)`);
    for (const g of selection.skillGroups) {
      lines.push(`*${esc(g.name)}:* ${esc(g.skills.join(", "))}`);
      lines.push("");
    }
    lines.push(`]`);
    lines.push("");
  }

  const roles = selection.entries.filter((se) => entryOf(se)?.kind === "ROLE");
  const projects = selection.entries.filter(
    (se) => entryOf(se)?.kind === "PROJECT",
  );

  if (roles.length > 0) {
    lines.push(`= Experience`);
    // Group consecutive roles at the same organisation.
    const groups: Entry[][] = [];
    for (const se of roles) {
      const last = groups[groups.length - 1];
      if (last && entryOf(last[0]!)!.organization === entryOf(se)!.organization)
        last.push(se);
      else groups.push([se]);
    }
    for (const group of groups) {
      const first = entryOf(group[0]!)!;
      lines.push(
        `#block(above: 1.9em, below: 0.5em, sticky: true)[#text(size: 10.2pt, weight: "bold")[${esc(first.organization)}]]`,
      );
      lines.push(
        `#block(stroke: (left: 0.7pt + rule), inset: (left: 0.75em), outset: (left: 0.15em), width: 100%)[`,
      );
      for (const se of group) {
        const e = entryOf(se)!;
        lines.push(
          `#block(above: 1.6em, below: 0.6em, sticky: true)[${twoColumn(`*${esc(e.title)}*`, roleMeta(dateRange(e.startDate, e.endDate), e.location))}]`,
        );
        bullets(se);
        lines.push("");
      }
      lines.push(`]`);
      lines.push("");
    }
  }

  if (projects.length > 0) {
    lines.push(`= Projects`);
    for (const se of projects) {
      const e = entryOf(se)!;
      const meta = [esc(e.organization)];
      if (e.url)
        meta.push(`#link(${str(e.url)})[${esc(linkItem(e.url).label)}]`);
      const dates = dateRange(e.startDate, e.endDate);
      if (dates) meta.push(esc(dates));
      lines.push(`#block(above: 1.25em, below: 0.55em, sticky: true)[`);
      lines.push(`#text(size: 10.2pt, weight: "bold")[${esc(e.title)}]`);
      lines.push(`#v(-0.05em)`);
      lines.push(metaLine(meta));
      lines.push(`]`);
      bullets(se);
      lines.push("");
    }
  }

  if (bank.education.length > 0) {
    lines.push(`= Education`);
    for (const ed of bank.education) lines.push(...education(ed));
  }

  const certs = selection.certifications
    .map((id) => bank.certifications.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);
  if (certs.length > 0) {
    lines.push(`= Certifications`);
    for (const c of certs) {
      const meta = [c.issuer, c.date ? formatMonth(c.date) : null]
        .filter(Boolean)
        .map((s) => esc(s!));
      if (c.url)
        meta.push(`#link(${str(c.url)})[${esc(linkItem(c.url).label)}]`);
      lines.push(`#block(above: 1.25em, below: 0.55em, sticky: true)[`);
      lines.push(`#text(size: 10.2pt, weight: "bold")[${esc(c.name)}]`);
      if (meta.length > 0) {
        lines.push(`#v(-0.05em)`);
        lines.push(metaLine(meta));
      }
      lines.push(`]`);
    }
  }

  return lines.join("\n");
}

function education(ed: Education): string[] {
  const meta = [
    ed.field,
    ed.institution,
    dateRange(ed.start, ed.end),
    ed.gpa ? `GPA ${ed.gpa}` : null,
  ]
    .filter(Boolean)
    .map((s) => esc(s!));
  const lines = [
    `#block(above: 1.25em, below: 0.55em, sticky: true)[`,
    `#text(size: 10.2pt, weight: "bold")[${esc(ed.degree)}]`,
    `#v(-0.05em)`,
    metaLine(meta),
    `]`,
  ];
  if (ed.honors) lines.push(`- ${esc(ed.honors)}`, "");
  return lines;
}

/** Cover letter as its own one-page PDF, with the same header as the resume. */
export function buildCoverLetterTypst(
  bank: Bank,
  text: string,
  job: { title: string; company: string },
): string {
  const lines: string[] = [
    ...preamble("10.2pt"),
    `#set par(leading: 0.92em, spacing: 1.1em)`,
    "",
    ...header(bank, null),
    "",
  ];
  lines.push(`#v(0.4em)`);
  lines.push(`#line(length: 100%, stroke: 0.6pt + rule)`);
  lines.push(`#v(1.4em)`);
  lines.push(`#text(size: 8.4pt, fill: muted)[${esc(today())}]`);
  lines.push(`#v(0.6em)`);
  lines.push(`*Re: ${esc(job.title)} at ${esc(job.company)}*`);
  lines.push(`#v(0.6em)`);
  for (const para of text.split(/\n\s*\n/)) {
    lines.push(esc(para.trim()));
    lines.push("");
  }
  return lines.join("\n");
}

function today(): string {
  const d = new Date();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export class TypstNotFoundError extends Error {
  constructor() {
    super(
      "Typst is not installed or not on PATH. Install it with `winget install Typst.Typst` or set TYPST_BIN.",
    );
  }
}

/**
 * Compiles Typst markup to PDF bytes. Needs the typst binary. Only the bundled
 * fonts are visible to it, so host and container output is identical.
 */
export async function compileTypst(source: string): Promise<Uint8Array> {
  const bin = process.env.TYPST_BIN || "typst";
  const dir = await mkdtemp(path.join(tmpdir(), "shortlisted-"));
  try {
    const input = path.join(dir, "doc.typ");
    const output = path.join(dir, "doc.pdf");
    await writeFile(input, source, "utf8");
    try {
      await execFileAsync(
        bin,
        [
          "compile",
          "--font-path",
          fontDir(),
          "--ignore-system-fonts",
          input,
          output,
        ],
        { windowsHide: true },
      );
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string };
      if (e.code === "ENOENT") throw new TypstNotFoundError();
      throw new Error(`typst compile failed: ${e.stderr ?? e.message}`);
    }
    return readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
