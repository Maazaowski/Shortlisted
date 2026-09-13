/**
 * Who runs the model calls.
 *
 *   anthropic  The Anthropic API through the SDK. Needs ANTHROPIC_API_KEY or
 *              an `ant auth login` profile. Costs money per capture.
 *   manual     Nobody, automatically. The app builds a prompt, the user pastes
 *              it into Claude (or anything else) and pastes the JSON reply back.
 *              Free, one paste round trip per capture.
 *
 * SHORTLISTED_PROVIDER picks explicitly. Unset, it is anthropic when a key is
 * present and manual otherwise, so a fresh install with no key still works.
 */
export type Provider = "anthropic" | "manual";

export function provider(): Provider {
  const v = process.env.SHORTLISTED_PROVIDER?.trim().toLowerCase();
  if (v === "anthropic" || v === "manual") return v;
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "manual";
}
