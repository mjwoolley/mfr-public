"use client";

import { useState, useTransition } from "react";
import { createExpense } from "@/actions/expenses";

export function ExpenseForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-lake-700 px-4 py-2 text-sm font-medium text-sand-50"
      >
        + Add Expense
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const formData = new FormData(form);
        startTransition(async () => {
          const result = await createExpense(undefined, formData);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setError(undefined);
          form.reset();
          setOpen(false);
        });
      }}
      className="mt-4 flex max-w-sm flex-col gap-4 rounded border border-sand-200 p-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        Description
        <input
          name="description"
          required
          className="rounded border border-sand-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Amount ($)
        <input
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          required
          className="rounded border border-sand-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Date incurred
        <input
          name="incurredAt"
          type="date"
          required
          className="rounded border border-sand-300 px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-lake-700 px-4 py-2 text-sm font-medium text-sand-50 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add expense"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
