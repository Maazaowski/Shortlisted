import "server-only";
import { LOCAL_USER_ID } from "@shortlisted/db";
import { applyProviderChoice } from "./provider-choice";

/**
 * Resolves the caller for /api routes. There is one user and no auth, so
 * this is a constant. The web app binds to loopback; that is the boundary.
 */
export async function resolveUserId(_req: Request): Promise<string> {
  await applyProviderChoice(LOCAL_USER_ID);
  return LOCAL_USER_ID;
}

/** Origins the extension may call from. Chrome extension pages have a chrome-extension:// origin. */
export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  // Any other origin gets no CORS headers at all, so a web page cannot read the answer.
  if (!origin.startsWith("chrome-extension://")) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function json(req: Request, body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, { ...init, headers: { ...corsHeaders(req), ...(init.headers ?? {}) } });
}
