import { z } from "zod";
import { json, preflight, resolveUserId } from "@/lib/api-auth";
import { getApplicationView, saveCoverLetter } from "@/lib/applications";

const Body = z.object({ text: z.string().trim().min(1).max(8000) });

export async function OPTIONS(req: Request) {
  return preflight(req);
}

/** Saves the user's edit of the cover letter and returns the application with the new flags. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await resolveUserId(req);
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json(req, { error: "The cover letter cannot be empty." }, { status: 400 });
  try {
    await saveCoverLetter(userId, id, body.data.text);
  } catch (err) {
    const message = (err as Error).message;
    return json(req, { error: message }, { status: message === "Not found" ? 404 : 409 });
  }
  return json(req, await getApplicationView(userId, id));
}
