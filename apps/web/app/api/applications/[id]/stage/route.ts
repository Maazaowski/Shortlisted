import { z } from "zod";
import { STAGES } from "@shortlisted/core";
import { json, preflight, resolveUserId } from "@/lib/api-auth";
import { changeStage, getApplicationView } from "@/lib/applications";

const Body = z.object({ stage: z.enum(STAGES), note: z.string().nullable().optional() });

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await resolveUserId(req);
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json(req, { error: "Invalid stage." }, { status: 400 });
  await changeStage(userId, id, body.data.stage, body.data.note ?? null);
  return json(req, await getApplicationView(userId, id));
}
