"use client";

import { useActionState } from "react";
import { ListChecks, Loader2 } from "lucide-react";
import { keyRequirementsAction, type RequirementsState } from "@/app/actions/listings";

/** Reads the posting once through the configured provider. The page shows the result after it is stored. */
export function KeyRequirementsButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<RequirementsState, FormData>(keyRequirementsAction, null);
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-sm" disabled={pending}>
        {pending ? <Loader2 size={13} className="spin" /> : <ListChecks size={13} strokeWidth={1.75} />} {pending ? "Reading the posting" : "Read the key requirements"}
      </button>
      {pending && <p className="text-xs text-ink-3">This can take up to a minute.</p>}
      {state && !pending && (
        <p className="callout callout-bad" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
