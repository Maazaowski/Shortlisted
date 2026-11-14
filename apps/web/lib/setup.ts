import "server-only";
import {
  cliLabel,
  cliStatus,
  isCliProvider,
  provider,
  type Provider,
} from "@shortlisted/core";
import { withUser } from "@shortlisted/db";
import { getPreferences } from "./preferences";

export type ModelStatus =
  | { provider: "manual"; ready: true }
  | { provider: "anthropic"; ready: boolean }
  | {
      provider: "claude-cli" | "codex-cli";
      ready: boolean;
      label: string;
      installed: boolean;
      signInCommand: string;
    };

export type SetupStatus = {
  model: ModelStatus;
  /** What the choice screen needs, whichever way is chosen. */
  choice: { current: Provider; installed: boolean; ready: boolean; hasApiKey: boolean };
  bank: { ready: boolean; bullets: number };
  preferences: { ready: boolean };
  extension: { ready: boolean; seenAt: Date | null };
  /** Every step a new user has to take is done. */
  complete: boolean;
};

/** Inside the image the tools are reached through Compose, so the sign-in command needs its prefix. */
export const IN_DOCKER = process.env.SHORTLISTED_DOCKER === "1";

async function modelStatus(p: Provider): Promise<ModelStatus> {
  if (p === "anthropic")
    return { provider: p, ready: Boolean(process.env.ANTHROPIC_API_KEY) };
  if (isCliProvider(p)) {
    const s = await cliStatus(p);
    return {
      provider: p,
      ready: s.installed && s.signedIn,
      label: cliLabel(p),
      installed: s.installed,
      signInCommand: IN_DOCKER
        ? `docker compose exec worker ${s.signInCommand}`
        : s.signInCommand,
    };
  }
  return { provider: "manual", ready: true };
}

/** Real state for the setup checklist. Nothing here is remembered; every row is checked when the page is read. */
export async function setupStatus(userId: string): Promise<SetupStatus> {
  const [model, counts, stored] = await Promise.all([
    modelStatus(provider()),
    withUser(userId, async (tx) => ({
      profile: await tx.profile.count({ where: { userId } }),
      bullets: await tx.bankBullet.count({ where: { userId } }),
    })),
    getPreferences(userId),
  ]);
  const bank = { ready: counts.profile > 0, bullets: counts.bullets };
  const preferences = { ready: stored.savedAt !== null };
  const extension = {
    ready: stored.extensionSeenAt !== null,
    seenAt: stored.extensionSeenAt,
  };
  return {
    model,
    choice: {
      current: model.provider,
      installed: "installed" in model ? model.installed : true,
      ready: model.ready,
      hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
    },
    bank,
    preferences,
    extension,
    complete: model.ready && bank.ready && preferences.ready && extension.ready,
  };
}
