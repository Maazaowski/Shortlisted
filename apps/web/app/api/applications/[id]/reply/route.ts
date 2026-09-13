import { z } from "zod";
import { ManualReplyError } from "@shortlisted/core";
import { json, preflight, resolveUserId } from "@/lib/api-auth";
import { getApplicationView, submitReply } from "@/lib/applications";

const Body = z.object({ text: z.string().min(2).max(200_000) });

export async function OPTIONS(req: Request) {
  return preflight(req);
}

/** Manual provider: the pasted reply from Claude. Validates it and queues the rest of the pipeline. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await resolveUserId(req);
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json(req, { error: "Paste the reply first." }, { status: 400 });
  try {
    await submitReply(userId, id, body.data.text);
  } catch (err) {
    if (err instanceof ManualReplyError) return json(req, { error: err.message }, { status: 422 });
    if ((err as Error).message === "Not found") return json(req, { error: "Not found" }, { status: 404 });
    throw err;
  }
  return json(req, await getApplicationView(userId, id));
}
