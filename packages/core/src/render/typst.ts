import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Bank, Selection } from "../schemas.js";
import { bulletIndex } from "../validate.js";

const execFileAsync = promisify(execFile);

/** Escape text for Typst markup. */
export function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/([#$*_`<>@\[\]])/g, "\\$1");
}

function dateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  return `${start ?? ""} to ${end ?? "present"}`;
}

/**
 * One fixed template, single column, plain text. Parsers read it and the user
 * never checks layout. Fonts fall back to whatever Typst finds on the machine.
 */
export function buildResumeTypst(bank: Bank, selection: Selection): string {
  const idx = bulletIndex(bank);
  const contact = [bank.email, bank.phone, bank.location, ...bank.links.map((l) => l.url)].filter(Boolean).map((s) => esc(s!)).join(" | ");

  const lines: string[] = [];
  lines.push(`#set page(paper: "a4", margin: (x: 1.6cm, y: 1.5cm))`);
  lines.push(`#set text(font: ("Source Sans 3", "Segoe UI", "Liberation Sans", "Helvetica", "Arial"), size: 10pt)`);
  lines.push(`#set par(justify: false, leading: 0.55em)`);
  lines.push(`#show heading.where(level: 2): it => block(above: 1.1em, below: 0.5em)[#text(size: 10.5pt, weight: "bold", tracking: 0.04em)[#upper(it.body)] #v(-0.35em) #line(length: 100%, stroke: 0.5pt)]`);
  lines.push("");
  lines.push(`#text(size: 18pt, weight: "bold")[${esc(bank.fullName)}]`);
  lines.push(`#v(-0.5em)`);
  lines.push(`#text(size: 11pt)[${esc(selection.headline)}]`);
  lines.push(`#v(-0.5em)`);
  lines.push(`#text(size: 9pt)[${contact}]`);
  lines.push("");
  lines.push(`== Summary`);
  lines.push(esc(selection.summary));
  lines.push("");

  if (selection.skillGroups.length > 0) {
    lines.push(`== Skills`);
    for (const g of selection.skillGroups) {
      lines.push(`*${esc(g.name)}:* ${esc(g.skills.join(", "))} \\`);
    }
    lines.push("");
  }

  const roles = selection.entries.filter((se) => bank.entries.find((e) => e.id === se.entryId)?.kind === "ROLE");
  const projects = selection.entries.filter((se) => bank.entries.find((e) => e.id === se.entryId)?.kind === "PROJECT");

  const renderEntries = (title: string, list: typeof selection.entries) => {
    if (list.length === 0) return;
    lines.push(`== ${title}`);
    for (const se of list) {
      const e = bank.entries.find((x) => x.id === se.entryId)!;
      const right = dateRange(e.startDate, e.endDate);
      lines.push(`#grid(columns: (1fr, auto), [*${esc(e.title)}*, ${esc(e.organization)}${e.location ? ", " + esc(e.location) : ""}], [#text(size: 9pt)[${esc(right)}]])`);
      for (const b of se.bullets) {
        const text = b.rewording ?? idx.get(b.id)?.bullet.text ?? "";
        lines.push(`- ${esc(text)}`);
      }
      lines.push("");
    }
  };
  renderEntries("Experience", roles);
  renderEntries("Projects", projects);

  if (bank.education.length > 0) {
    lines.push(`== Education`);
    for (const ed of bank.education) {
      const degree = [ed.degree, ed.field].filter(Boolean).join(", ");
      lines.push(`#grid(columns: (1fr, auto), [*${esc(degree)}*, ${esc(ed.institution)}], [#text(size: 9pt)[${esc(dateRange(ed.start, ed.end))}]])`);
    }
  }

  return lines.join("\n");
}

/** Cover letter as its own one-page PDF. */
export function buildCoverLetterTypst(bank: Bank, text: string, job: { title: string; company: string }): string {
  const lines: string[] = [];
  lines.push(`#set page(paper: "a4", margin: (x: 2cm, y: 2cm))`);
  lines.push(`#set text(font: ("Source Sans 3", "Segoe UI", "Liberation Sans", "Helvetica", "Arial"), size: 11pt)`);
  lines.push(`#set par(leading: 0.7em)`);
  lines.push(`*${esc(bank.fullName)}* \\`);
  lines.push(`${[bank.email, bank.phone].filter(Boolean).map((s) => esc(s!)).join(" | ")}`);
  lines.push(``);
  lines.push(`#v(1em)`);
  lines.push(`Re: ${esc(job.title)} at ${esc(job.company)}`);
  lines.push(`#v(0.5em)`);
  for (const para of text.split(/\n\s*\n/)) {
    lines.push(esc(para.trim()));
    lines.push("");
  }
  return lines.join("\n");
}

export class TypstNotFoundError extends Error {
  constructor() {
    super("Typst is not installed or not on PATH. Install it with `winget install Typst.Typst` or set TYPST_BIN.");
  }
}

/** Compiles Typst markup to PDF bytes. Needs the typst binary. */
export async function compileTypst(source: string): Promise<Uint8Array> {
  const bin = process.env.TYPST_BIN || "typst";
  const dir = await mkdtemp(path.join(tmpdir(), "shortlisted-"));
  try {
    const input = path.join(dir, "doc.typ");
    const output = path.join(dir, "doc.pdf");
    await writeFile(input, source, "utf8");
    try {
      await execFileAsync(bin, ["compile", input, output], { windowsHide: true });
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
