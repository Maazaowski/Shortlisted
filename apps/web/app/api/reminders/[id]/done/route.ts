import { json, preflight, resolveUserId } from "@/lib/api-auth";
import { getApplicationView } from "@/lib/applications";
import { completeReminder } from "@/lib/reminders";

export async function OPTIONS(req: Request) {
  return preflight(req);
}

/** Marks a follow-up reminder done and returns its application. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await resolveUserId(req);
  const { id } = await ctx.params;
  const applicationId = await completeReminder(userId, id);
  if (!applicationId) return json(req, { error: "Not found" }, { status: 404 });
  return json(req, await getApplicationView(userId, applicationId));
}
