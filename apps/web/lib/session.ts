import "server-only";
import { LOCAL_USER_ID } from "@shortlisted/db";

export type SessionUser = { id: string };

/**
 * There is one user and no sign-in. Pages call this so every data access
 * still names its user; it never redirects.
 */
export async function requireUser(): Promise<SessionUser> {
  return { id: LOCAL_USER_ID };
}
