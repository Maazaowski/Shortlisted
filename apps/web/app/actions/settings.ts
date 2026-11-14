"use server";

import { redirect } from "next/navigation";
import { PreferencesSchema, parseTitleLines } from "@shortlisted/core";
import { requireUser } from "@/lib/session";
import { savePreferences } from "@/lib/preferences";

export async function savePreferencesAction(form: FormData) {
  const user = await requireUser();
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const goal = text("weeklyGoal");
  const parsed = PreferencesSchema.safeParse({
    homeCountry: text("homeCountry"),
    citizenship: text("citizenship"),
    pools: form.getAll("pools").map(String),
    fields: form.getAll("fields").map(String),
    targetTitles: parseTitleLines(text("targetTitles")),
    weeklyGoal: goal === "" ? null : Number(goal),
    feedUrl: text("feedUrl") || null,
  });
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Those settings could not be saved.";
    redirect(`/settings?error=${encodeURIComponent(message)}`);
  }
  await savePreferences(user.id, parsed.data);
  redirect(text("next") === "setup" ? "/setup" : "/settings?saved=1");
}
