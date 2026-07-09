"use client";

import { useActionState } from "react";
import { createAdjustment, type ActionState } from "@/actions/adjustments";

export function AdjustmentForm({ shareholders }: { shareholders: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createAdjustment,
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
        Amount ($) — positive to add shares, negative to remove
        <input
          name="amount"
          type="number"
          step="0.01"
          required
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Reason
        <textarea
          name="description"
          required
          rows={3}
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "Recording…" : "Record adjustment"}
      </button>
    </form>
  );
}
