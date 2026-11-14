"use server";

import { revalidatePath } from "next/cache";
import { isCliProvider, pingModel, provider, PROVIDERS } from "@shortlisted/core";
import { requireUser } from "@/lib/session";
import { logout, loginStatus, startLogin, submitLoginCode, type LoginView } from "@/lib/cli-login";
import { saveProviderChoice } from "@/lib/provider-choice";

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

/** Saves how the writing is done. Takes effect at once, in the web app and the worker, with no restart. */
export async function chooseModelAction(choice: string): Promise<{ error?: string } | null> {
  const user = await requireUser();
  const known = PROVIDERS.find((p) => p === choice);
  if (!known) return { error: "That is not one of the choices." };
  if (known === "anthropic" && !process.env.ANTHROPIC_API_KEY) return { error: "No API key is set in the .env file." };
  await saveProviderChoice(user.id, known);
  revalidatePath("/setup");
  revalidatePath("/settings");
  return null;
}

export type SignInView = LoginView;

/** Starts the sign-in of the chosen tool and returns the link it prints. */
export async function startSignInAction(): Promise<SignInView | null> {
  await requireUser();
  const p = provider();
  if (!isCliProvider(p)) return null;
  return startLogin(p);
}

/** Claude Code: the code from the sign-in page. */
export async function finishSignInAction(code: string): Promise<SignInView | null> {
  await requireUser();
  const result = await submitLoginCode(String(code).slice(0, 2000));
  revalidatePath("/setup");
  revalidatePath("/settings");
  return result;
}

export async function signInStatusAction(): Promise<SignInView | null> {
  await requireUser();
  return loginStatus();
}

export async function signOutAction(): Promise<void> {
  await requireUser();
  const p = provider();
  if (isCliProvider(p)) await logout(p);
  revalidatePath("/setup");
  revalidatePath("/settings");
}
