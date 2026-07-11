"use client";

import { useState, useTransition } from "react";
import { resolveDispute } from "@/actions/approvals";

export function ResolveDisputeForm({ approvalId }: { approvalId: string }) {
  const [open, setOpen] = useState(false);
  const [resolutionTransactionId, setResolutionTransactionId] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="underline"
      >
        Mark resolved
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await resolveDispute(approvalId, resolutionTransactionId || undefined);
          setOpen(false);
        });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        type="text"
        value={resolutionTransactionId}
        onChange={(e) => setResolutionTransactionId(e.target.value)}
        placeholder="Correction transaction id (optional)"
        className="rounded border border-sand-300 px-2 py-1 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-lake-700 px-3 py-1 text-xs font-medium text-sand-50 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Confirm resolved"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs underline">
        Cancel
      </button>
    </form>
  );
}
