"use client";

import { useActionState } from "react";
import { createContribution, type ActionState } from "@/actions/contributions";

export function ContributionForm({
  shareholders,
}: {
  shareholders: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createContribution,
    undefined,
  );

  return (
    <form action={formAction} className="mt-6 flex max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Shareholder
        <select
          name="shareholderId"
          required
          defaultValue=""
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        >
          <option value="" disabled>
            Select a shareholder
          </option>
          {shareholders.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Amount ($)
        <input
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
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
        {pending ? "Recording…" : "Record contribution"}
      </button>
    </form>
  );
}
