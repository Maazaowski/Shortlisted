import "server-only";
import { extractText } from "unpdf";
import mammoth from "mammoth";

export const RESUME_ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const RESUME_MAX_BYTES = 5 * 1024 * 1024;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Kind = "pdf" | "docx" | "doc" | "unknown";

function kindOf(file: File): Kind {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type === DOCX_MIME || name.endsWith(".docx")) return "docx";
  if (file.type === "application/msword" || name.endsWith(".doc")) return "doc";
  return "unknown";
}

export class ResumeReadError extends Error {}

/**
 * The text of an uploaded resume, whatever the format. PDF through unpdf,
 * Word through mammoth. Throws ResumeReadError with a sentence the user can act on.
 */
export async function resumeText(file: File): Promise<string> {
  const kind = kindOf(file);
  if (kind === "doc") throw new ResumeReadError("Old .doc files are not supported. Save it as .docx or PDF and try again.");
  if (kind === "unknown") throw new ResumeReadError("Choose a PDF or a Word document (.docx).");

  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try {
    if (kind === "pdf") {
      text = (await extractText(bytes, { mergePages: true })).text;
    } else {
      text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    }
  } catch {
    throw new ResumeReadError(kind === "pdf" ? "Could not read that PDF. Try exporting it again." : "Could not read that Word document. Try saving it again as .docx.");
  }
  text = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 200) {
    throw new ResumeReadError(kind === "pdf" ? "That PDF has almost no text. Is it a scan?" : "That document has almost no text.");
  }
  return text;
}
