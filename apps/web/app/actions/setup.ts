"use server";

import { pingModel } from "@shortlisted/core";
import { requireUser } from "@/lib/session";

export type TestState = { ok: boolean; message: string } | null;

/** One small real call to whichever provider is configured. */
export async function testModelAction(_prev: TestState): Promise<TestState> {
  await requireUser();
  try {
    await pingModel();
    return { ok: true, message: "It answered." };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
