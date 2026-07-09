"use client";

import { useActionState } from "react";
import { createCorrection, type ActionState } from "@/actions/corrections";

export function CorrectionForm({
  originalTransactionId,
  entries,
}: {
  originalTransactionId: string;
  entries: { shareholderId: string; shareholderName: string; originalShares: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createCorrection,
    undefined,
  );

  return (
    <form action={formAction} className="mt-6 flex max-w-md flex-col gap-4">
      <input type="hidden" name="originalTransactionId" value={originalTransactionId} />
      {entries.map((e) => (
        <label key={e.shareholderId} className="flex flex-col gap-1 text-sm">
          Correction amount ($) for {e.shareholderName} — originally {e.originalShares}
          <input
            name={`amount_${e.shareholderId}`}
            type="number"
            step="0.01"
            required
            defaultValue={(-Number(e.originalShares)).toString()}
            className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
      ))}
      <label className="flex flex-col gap-1 text-sm">
        Description
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
        {pending ? "Recording…" : "Record correction"}
      </button>
    </form>
  );
}
