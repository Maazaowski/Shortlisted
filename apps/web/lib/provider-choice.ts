import "server-only";
import { PROVIDERS, setProviderChoice, type Provider } from "@shortlisted/core";
import { withUser } from "@shortlisted/db";

/**
 * The model choice made in the app (Setup or Settings) is stored with the
 * preferences and outranks the .env file, so nobody has to edit a file.
 * This loads it into the running process. Pages and API routes call it
 * through requireUser() and resolveUserId(), so every request sees the
 * current choice; the worker does the same at the start of each job.
 */

const g = globalThis as unknown as { shortlistedProviderAt?: number };
const FRESH_MS = 2000;

function known(value: string | null | undefined): Provider | null {
  return PROVIDERS.find((p) => p === value) ?? null;
}

export async function applyProviderChoice(userId: string, force = false): Promise<void> {
  const now = Date.now();
  if (!force && g.shortlistedProviderAt && now - g.shortlistedProviderAt < FRESH_MS) return;
  g.shortlistedProviderAt = now;
  try {
    const row = await withUser(userId, (tx) => tx.preferences.findUnique({ where: { userId }, select: { provider: true } }));
    setProviderChoice(known(row?.provider));
  } catch {
    // A database that is not ready yet must not take every page down with it. The .env choice stands.
  }
}

export async function saveProviderChoice(userId: string, choice: Provider): Promise<void> {
  await withUser(userId, (tx) => tx.preferences.upsert({ where: { userId }, create: { userId, provider: choice }, update: { provider: choice } }));
  await applyProviderChoice(userId, true);
}
