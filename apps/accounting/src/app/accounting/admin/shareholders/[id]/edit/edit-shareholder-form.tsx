"use client";

import { useActionState, useState, useTransition } from "react";
import {
  updateShareholder,
  setShareholderActive,
  type ActionState,
} from "@/actions/shareholders";
import type { Shareholder } from "@/generated/prisma/client";

export function EditShareholderForm({ shareholder }: { shareholder: Shareholder }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateShareholder,
    undefined,
  );
  const [active, setActive] = useState(shareholder.active);
  const [isTogglePending, startToggleTransition] = useTransition();

  return (
    <div className="mt-6 flex max-w-sm flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="shareholderId" value={shareholder.id} />
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            name="name"
            defaultValue={shareholder.name}
            required
            className="rounded border border-sand-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email (optional)
          <input
            name="email"
            type="email"
            defaultValue={shareholder.email ?? ""}
            className="rounded border border-sand-300 px-3 py-2"
          />
        </label>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-lake-700 px-4 py-2 text-sm font-medium text-sand-50 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </form>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={active}
          disabled={isTogglePending}
          onChange={(e) => {
            const next = e.target.checked;
            setActive(next);
            startToggleTransition(async () => {
              await setShareholderActive(shareholder.id, next);
            });
          }}
        />
        Active
      </label>
    </div>
  );
}
