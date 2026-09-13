import { z } from "zod";
import { json, preflight, resolveUserId } from "@/lib/api-auth";
import { addNote, getApplicationView } from "@/lib/applications";

const Body = z.object({ body: z.string().min(1).max(5000) });

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await resolveUserId(req);
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json(req, { error: "Note cannot be empty." }, { status: 400 });
  await addNote(userId, id, body.data.body.trim());
  return json(req, await getApplicationView(userId, id));
}
