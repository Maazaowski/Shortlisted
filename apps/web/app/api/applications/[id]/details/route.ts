import { z } from "zod";
import { json, preflight, resolveUserId } from "@/lib/api-auth";
import { getApplicationView, updateDetails } from "@/lib/applications";

const text = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform((s) => s?.trim() || null);
/** A day as YYYY-MM-DD, stored at 00:00 UTC. */
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .transform((s) => (s ? new Date(`${s}T00:00:00Z`) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()));

const Body = z.object({
  contactName: text(200),
  contactEmail: text(200).refine((s) => s === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), "email"),
  contactUrl: text(500).refine((s) => s === null || /^https?:\/\//i.test(s), "url"),
  interviewAt: day,
  deadlineAt: day,
});

export async function OPTIONS(req: Request) {
  return preflight(req);
}

/** The contact and the dates the user keeps for an application. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await resolveUserId(req);
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    const field = body.error.issues[0]?.path[0];
    const message = field === "contactEmail" ? "That email address does not look right." : field === "contactUrl" ? "The link has to start with http:// or https://." : "Those details could not be saved.";
    return json(req, { error: message }, { status: 400 });
  }
  await updateDetails(userId, id, body.data);
  const view = await getApplicationView(userId, id);
  if (!view) return json(req, { error: "Not found" }, { status: 404 });
  return json(req, view);
}
