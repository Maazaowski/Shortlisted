import "server-only";
import {
  DEFAULT_PREFERENCES,
  PreferencesSchema,
  type Preferences,
} from "@shortlisted/core";
import { withUser } from "@shortlisted/db";

export type StoredPreferences = {
  prefs: Preferences;
  savedAt: Date | null;
  extensionSeenAt: Date | null;
};

/** The user's preferences, or the defaults when nothing was saved yet. */
export async function getPreferences(
  userId: string,
): Promise<StoredPreferences> {
  const row = await withUser(userId, (tx) =>
    tx.preferences.findUnique({ where: { userId } }),
  );
  if (!row)
    return { prefs: DEFAULT_PREFERENCES, savedAt: null, extensionSeenAt: null };
  const parsed = PreferencesSchema.safeParse({
    homeCountry: row.homeCountry,
    citizenship: row.citizenship,
    pools: row.pools,
    fields: row.fields,
    targetTitles: row.targetTitles,
    weeklyGoal: row.weeklyGoal,
    feedUrl: row.feedUrl,
  });
  // A row written by an older version may hold ids that no longer exist. Fall back rather than fail the page.
  return {
    prefs: parsed.success ? parsed.data : DEFAULT_PREFERENCES,
    savedAt: row.savedAt,
    extensionSeenAt: row.extensionSeenAt,
  };
}

export async function savePreferences(
  userId: string,
  prefs: Preferences,
): Promise<void> {
  const data = { ...prefs, savedAt: new Date() };
  await withUser(userId, (tx) =>
    tx.preferences.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    }),
  );
}

/** Called from the extension's health check, so the setup checklist can show it connected. */
export async function markExtensionSeen(userId: string): Promise<void> {
  const now = new Date();
  await withUser(userId, (tx) =>
    tx.preferences.upsert({
      where: { userId },
      create: { userId, extensionSeenAt: now },
      update: { extensionSeenAt: now },
    }),
  );
}
