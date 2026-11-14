import "server-only";

/** Set by the release build. "dev" for anything built from a checkout. */
export const VERSION = process.env.SHORTLISTED_VERSION?.trim() || "dev";
export const REPO =
  process.env.SHORTLISTED_REPO?.trim() || "Maazaowski/Shortlisted";
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

function parts(tag: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isNewer(latest: string, current: string): boolean {
  const a = parts(latest);
  const b = parts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * The newer release, if there is one. One anonymous request to GitHub, cached
 * for six hours, carrying nothing about the user. Any failure means "no news".
 * SHORTLISTED_UPDATE_CHECK=off turns it off.
 */
export async function newerRelease(): Promise<{
  tag: string;
  url: string;
} | null> {
  if (
    VERSION === "dev" ||
    process.env.SHORTLISTED_UPDATE_CHECK?.trim().toLowerCase() === "off"
  )
    return null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "shortlisted",
        },
        next: { revalidate: 6 * 60 * 60 },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      tag_name?: unknown;
      html_url?: unknown;
    };
    if (typeof body.tag_name !== "string" || !isNewer(body.tag_name, VERSION))
      return null;
    return {
      tag: body.tag_name,
      url: typeof body.html_url === "string" ? body.html_url : RELEASES_URL,
    };
  } catch {
    return null;
  }
}
