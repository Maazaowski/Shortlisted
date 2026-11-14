"use client";

import { useActionState } from "react";
import { testModelAction, type TestState } from "@/app/actions/setup";

/** Sends one short request through the configured provider and says what came back. */
export function TestModelButton() {
  const [state, action, pending] = useActionState<TestState>(
    testModelAction,
    null,
  );
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <button className="btn btn-sm" disabled={pending}>
        {pending ? "Testing" : "Test it"}
      </button>
      {state && !pending && (
        <p
          className={`callout ${state.ok ? "callout-good" : "callout-bad"}`}
          role="status"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
