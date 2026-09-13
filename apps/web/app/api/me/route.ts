import { json, preflight, resolveUserId } from "@/lib/api-auth";
import { withUser } from "@shortlisted/db";

export async function OPTIONS(req: Request) {
  return preflight(req);
}

/** Health check for the extension: is the web app up, and has the resume been imported? */
export async function GET(req: Request) {
  const userId = await resolveUserId(req);
  const profile = await withUser(userId, (tx) => tx.profile.findFirst({ where: { userId } }));
  return json(req, { ok: true, hasProfile: Boolean(profile), name: profile?.fullName ?? null, email: profile?.email ?? null });
}
