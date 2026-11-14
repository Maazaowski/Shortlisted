import { json, preflight, resolveUserId } from "@/lib/api-auth";
import { withUser } from "@shortlisted/db";
import { markExtensionSeen } from "@/lib/preferences";

export async function OPTIONS(req: Request) {
  return preflight(req);
}

/** Health check for the extension: is the web app up, and has the resume been imported? */
export async function GET(req: Request) {
  const userId = await resolveUserId(req);
  // Only the extension sends a chrome-extension:// origin. This is how the setup checklist knows it is connected.
  if ((req.headers.get("origin") ?? "").startsWith("chrome-extension://")) await markExtensionSeen(userId);
  const profile = await withUser(userId, (tx) => tx.profile.findFirst({ where: { userId } }));
  return json(req, { ok: true, hasProfile: Boolean(profile), name: profile?.fullName ?? null, email: profile?.email ?? null });
}
