import { z } from "zod";
import { json, preflight, resolveUserId } from "@/lib/api-auth";
import { getApplicationView, regenerate } from "@/lib/applications";

const Body = z.object({ note: z.string().max(500).nullable().optional() });

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await resolveUserId(req);
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return json(req, { error: "Invalid body." }, { status: 400 });
  const existing = await getApplicationView(userId, id);
  if (!existing) return json(req, { error: "Not found" }, { status: 404 });
  await regenerate(userId, id, body.data.note ?? null);
  return json(req, await getApplicationView(userId, id));
}
