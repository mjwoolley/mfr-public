"use client";

import { useActionState, useState, useTransition } from "react";
import { updateShareholder, setShareholderActive, type ActionState } from "@/actions/accounting/shareholders";
import type { ShareholderRow } from "@/lib/db/schema";

export function EditShareholderForm({ shareholder }: { shareholder: ShareholderRow }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateShareholder,
    undefined,
  );
  const [active, setActive] = useState(shareholder.active);
  const [isTogglePending, startToggleTransition] = useTransition();

  return (
    <div className="mt-5 flex max-w-sm flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-3.5">
        <input type="hidden" name="shareholderId" value={shareholder.id} />
        <div className="field">
          <label htmlFor="edit-sh-name">Name</label>
          <input
            id="edit-sh-name"
            name="name"
            defaultValue={shareholder.name}
            required
            className="input"
          />
        </div>
        <div className="field">
          <label htmlFor="edit-sh-email">Email (optional)</label>
          <input
            id="edit-sh-email"
            name="email"
            type="email"
            defaultValue={shareholder.email ?? ""}
            className="input"
          />
        </div>
        {state?.error && (
          <p className="m-0 text-[13px] font-semibold" style={{ color: "var(--color-accent-800)" }}>
            {state.error}
          </p>
        )}
        <div>
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
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
