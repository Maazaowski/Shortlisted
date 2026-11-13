import { corsHeaders, preflight, resolveUserId } from "@/lib/api-auth";
import { exportCsv, exportData } from "@/lib/export";

export async function OPTIONS(req: Request) {
  return preflight(req);
}

/** Downloads the user's data: `?format=csv` for one row per application, otherwise everything as JSON. */
export async function GET(req: Request) {
  const userId = await resolveUserId(req);
  const csv = new URL(req.url).searchParams.get("format") === "csv";
  const stamp = new Date().toISOString().slice(0, 10);
  const body = csv ? await exportCsv(userId) : JSON.stringify(await exportData(userId), null, 2);
  return new Response(body, {
    headers: {
      ...corsHeaders(req),
      "Content-Type": csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="shortlisted-${csv ? "applications" : "export"}-${stamp}.${csv ? "csv" : "json"}"`,
      "Cache-Control": "no-store",
    },
  });
}
