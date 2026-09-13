import { CaptureSchema } from "@shortlisted/core";
import { json, preflight, resolveUserId } from "@/lib/api-auth";
import { createApplicationFromCapture, findByUrl } from "@/lib/applications";

export async function OPTIONS(req: Request) {
  return preflight(req);
}

/** Lookup by page URL, so the panel can show an existing result when a tab opens. */
export async function GET(req: Request) {
  const userId = await resolveUserId(req);
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return json(req, { error: "url is required" }, { status: 400 });
  return json(req, await findByUrl(userId, url));
}

/** Capture from the extension (or the paste form). Creates the job and queues generation. */
export async function POST(req: Request) {
  const userId = await resolveUserId(req);
  const parsed = CaptureSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "Invalid capture payload." }, { status: 400 });
  try {
    const result = await createApplicationFromCapture(userId, parsed.data);
    return json(req, result, { status: result.existing ? 200 : 201 });
  } catch (err) {
    return json(req, { error: (err as Error).message }, { status: 422 });
  }
}
