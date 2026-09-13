function safe(part: string): string {
  return part
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Applies the user's file name format. Tokens: {name} {title} {company}. */
export function resumeFileName(format: string, parts: { name: string; title: string; company: string }): string {
  const out = format
    .replace("{name}", safe(parts.name))
    .replace("{title}", safe(parts.title))
    .replace("{company}", safe(parts.company));
  return out.endsWith(".pdf") ? out : `${out}.pdf`;
}
