import "server-only";
import { LOCAL_USER_ID } from "@shortlisted/db";
import { applyProviderChoice } from "./provider-choice";

export type SessionUser = { id: string };

/**
 * There is one user and no sign-in. Pages call this so every data access
 * still names its user; it never redirects.
 */
export async function requireUser(): Promise<SessionUser> {
  await applyProviderChoice(LOCAL_USER_ID);
  return { id: LOCAL_USER_ID };
}
