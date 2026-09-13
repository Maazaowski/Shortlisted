import { corsHeaders, json, preflight, resolveUserId } from "@/lib/api-auth";
import { promptFor } from "@/lib/applications";

export async function OPTIONS(req: Request) {
  return preflight(req);
}

/** Manual provider: the prompt to paste into Claude for this application, as plain text. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await resolveUserId(req);
  const { id } = await ctx.params;
  try {
    const prompt = await promptFor(userId, id);
    if (prompt === null) return json(req, { error: "Not found" }, { status: 404 });
    return new Response(prompt, { headers: { ...corsHeaders(req), "Content-Type": "text/plain; charset=utf-8" } });
  } catch (err) {
    return json(req, { error: (err as Error).message }, { status: 409 });
  }
}
