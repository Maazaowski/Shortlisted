import { withUser } from "@shortlisted/db";
import { corsHeaders, json, preflight, resolveUserId } from "@/lib/api-auth";
import { storage } from "@/lib/storage";

export async function OPTIONS(req: Request) {
  return preflight(req);
}

/** The PDF bytes for a document. Used by Attach and the download links. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await resolveUserId(req);
  const { id } = await ctx.params;
  const doc = await withUser(userId, (tx) => tx.document.findUnique({ where: { id } }));
  if (!doc) return json(req, { error: "Not found" }, { status: 404 });
  if (!doc.fileKey) return json(req, { error: "This document has no rendered file. Is Typst installed on the worker?" }, { status: 409 });
  const bytes = await storage.get(doc.fileKey);
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new Response(new Uint8Array(bytes), {
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Access-Control-Expose-Headers": "Content-Disposition",
    },
  });
}
