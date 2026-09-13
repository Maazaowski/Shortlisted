import { json, preflight, resolveUserId } from "@/lib/api-auth";
import { getApplicationView } from "@/lib/applications";

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await resolveUserId(req);
  const { id } = await ctx.params;
  const view = await getApplicationView(userId, id);
  if (!view) return json(req, { error: "Not found" }, { status: 404 });
  return json(req, view);
}
