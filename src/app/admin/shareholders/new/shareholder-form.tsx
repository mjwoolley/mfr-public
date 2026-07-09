"use client";

import { useActionState } from "react";
import { createShareholder, type ActionState } from "@/actions/shareholders";

export function ShareholderForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createShareholder,
    undefined,
  );

  return (
    <form action={formAction} className="mt-6 flex max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          name="name"
          required
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          name="email"
          type="email"
          required
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add shareholder"}
      </button>
    </form>
  );
}
