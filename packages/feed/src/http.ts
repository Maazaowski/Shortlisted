import { stripHtml } from "@shortlisted/core";

/**
 * One polite fetch for every source: a generic client name, a timeout, one
 * retry on a network error or a 5xx, and no retry on a 4xx (a board that is
 * gone stays gone).
 */
const USER_AGENT = "shortlisted-feed/1 (open job feed builder)";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`${status} from ${new URL(url).host}`);
  }
}

async function get(url: string, accept: string, timeoutMs: number): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: accept }, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429) throw new HttpError(res.status, url);
      last = new HttpError(res.status, url);
    } catch (err) {
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) throw err;
      last = err;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function getJson(url: string, timeoutMs = 25_000): Promise<unknown> {
  return (await get(url, "application/json", timeoutMs)).json();
}

export async function getText(url: string, timeoutMs = 60_000): Promise<string> {
  return (await get(url, "*/*", timeoutMs)).text();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** HTML to plain text. `encoded` is for sources that send HTML with its tags entity-encoded. */
export function htmlToText(html: string, encoded = false): string {
  const text = stripHtml(encoded ? decodeEntities(html) : html);
  return decodeEntities(text).replace(/ /g, " ");
}

/** Runs tasks with at most `limit` in flight. A task that throws yields its error, not a rejection. */
export async function pool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<({ ok: true; value: R } | { ok: false; error: Error })[]> {
  const results: ({ ok: true; value: R } | { ok: false; error: Error })[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      const item = items[i] as T;
      try {
        results[i] = { ok: true, value: await task(item) };
      } catch (err) {
        results[i] = { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Narrowing helpers for JSON we did not write. */
export const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
export const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
