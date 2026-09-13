import { createHash } from "node:crypto";
import type { Capture } from "./schemas.js";

export type NormalizedCapture = {
  rawText: string;
  title: string | null;
  company: string | null;
  sourceHost: string | null;
  contentHash: string;
  fromJsonLd: boolean;
};

type JobPostingLd = {
  "@type"?: string | string[];
  title?: string;
  description?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?: unknown;
};

function findJobPosting(node: unknown): JobPostingLd | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n);
      if (hit) return hit;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return obj as JobPostingLd;
  if (obj["@graph"]) return findJobPosting(obj["@graph"]);
  return null;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MAX_TEXT = 30_000;

/**
 * Turns what the extension scraped into the text the parser sees. JSON-LD wins
 * when present because it is structured and stable across site redesigns.
 */
export function normalizeCapture(capture: Capture): NormalizedCapture {
  let sourceHost: string | null = null;
  if (capture.url) {
    try {
      sourceHost = new URL(capture.url).hostname.replace(/^www\./, "");
    } catch {
      sourceHost = null;
    }
  }

  const ld = findJobPosting(capture.jsonLd);
  if (ld && ld.description) {
    const company = typeof ld.hiringOrganization === "string" ? ld.hiringOrganization : ld.hiringOrganization?.name ?? null;
    const title = ld.title ?? null;
    const body = stripHtml(ld.description);
    const rawText = [title ? `Title: ${title}` : "", company ? `Company: ${company}` : "", "", body].filter(Boolean).join("\n").slice(0, MAX_TEXT);
    return { rawText, title, company, sourceHost, contentHash: hashText(rawText), fromJsonLd: true };
  }

  const text = capture.text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_TEXT);
  const rawText = capture.pageTitle ? `Page title: ${capture.pageTitle}\n\n${text}` : text;
  return { rawText, title: provisionalTitle(capture.pageTitle), company: null, sourceHost, contentHash: hashText(rawText), fromJsonLd: false };
}

/**
 * A stand-in title from the page title until the parse replaces it: the part
 * before the first separator, so "Backend Engineer - Lumen | Careers" becomes
 * "Backend Engineer". Null when there is nothing usable.
 */
export function provisionalTitle(pageTitle: string | null | undefined): string | null {
  const first = (pageTitle ?? "").split(/\s+[-|·–—:]\s+/)[0]?.trim() ?? "";
  if (first.length < 3 || first.length > 120) return null;
  return first;
}

export function hashText(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}
