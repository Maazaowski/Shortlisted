"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { createApplicationFromCapture } from "@/lib/applications";

export type GenerateState = { error?: string } | null;

/** Build step 3: the paste form that proves the pipeline before the extension exists. */
export async function generateFromPasteAction(_prev: GenerateState, form: FormData): Promise<GenerateState> {
  const user = await requireUser();
  const url = String(form.get("url") ?? "").trim();
  const text = String(form.get("text") ?? "").trim();
  if (text.length < 80) return { error: "Paste the full posting." };
  let id: string;
  try {
    const result = await createApplicationFromCapture(user.id, { url: url || null, pageTitle: "", jsonLd: null, text });
    id = result.id;
  } catch (err) {
    return { error: (err as Error).message };
  }
  redirect(`/applications/${id}`);
}
