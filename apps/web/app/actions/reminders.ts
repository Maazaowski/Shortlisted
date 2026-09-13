"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { completeReminder } from "@/lib/reminders";

/** The Done button on the board's follow-up list. */
export async function markReminderDoneAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  if (id) await completeReminder(user.id, id);
  revalidatePath("/board");
}
