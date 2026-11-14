/**
 * Who runs the model calls.
 *
 *   anthropic   The Anthropic API through the SDK. Needs ANTHROPIC_API_KEY or
 *               an `ant auth login` profile. Costs money per capture.
 *   claude-cli  The Claude Code command line tool, signed in with the user's
 *               own Claude subscription. No key, no pasting.
 *   codex-cli   The Codex command line tool, signed in with the user's own
 *               ChatGPT subscription. No key, no pasting.
 *   manual      Nobody, automatically. The app builds a prompt, the user pastes
 *               it into Claude (or anything else) and pastes the JSON reply back.
 *               Free, one paste round trip per capture.
 *
 * A choice made in the app (Setup or Settings) comes first: the web app and
 * the worker load it from the database with setProviderChoice(). Without one,
 * SHORTLISTED_PROVIDER picks explicitly. Unset, it is anthropic when a key is
 * present and manual otherwise, so a fresh install with no key still works.
 * The CLI providers are never guessed: being installed does not mean being
 * signed in.
 */
export const PROVIDERS = [
  "anthropic",
  "claude-cli",
  "codex-cli",
  "manual",
] as const;
export type Provider = (typeof PROVIDERS)[number];
export type CliProvider = Extract<Provider, "claude-cli" | "codex-cli">;

let chosen: Provider | null = null;

/** The choice stored in the app, or null to fall back to the environment. */
export function setProviderChoice(choice: Provider | null): void {
  chosen = choice;
}

export function provider(): Provider {
  if (chosen) return chosen;
  const v = process.env.SHORTLISTED_PROVIDER?.trim().toLowerCase();
  const known = PROVIDERS.find((p) => p === v);
  if (known) return known;
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "manual";
}

export function isCliProvider(p: Provider): p is CliProvider {
  return p === "claude-cli" || p === "codex-cli";
}
