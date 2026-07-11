"use client";

import { useState, useTransition } from "react";
import { confirmTransaction, disputeTransaction } from "@/actions/approvals";

export function InboxApprovalActions({ approvalId }: { approvalId: string }) {
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  if (disputing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            await disputeTransaction(approvalId, reason);
          });
        }}
        className="mt-3 flex flex-col gap-2"
      >
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          rows={2}
          placeholder="Why are you disputing this?"
          className="rounded border border-sand-300 px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending || !reason.trim()}
            className="rounded-full bg-red-700 px-4 py-1.5 text-sm font-medium text-sand-50 disabled:opacity-50"
          >
            {pending ? "Submitting…" : "Submit dispute"}
          </button>
          <button
            type="button"
            onClick={() => setDisputing(false)}
            className="rounded-full border border-sand-300 px-4 py-1.5 text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => { await confirmTransaction(approvalId); })}
        className="rounded-full bg-lake-700 px-4 py-1.5 text-sm font-medium text-sand-50 disabled:opacity-50"
      >
        Confirm
      </button>
      <button
        type="button"
        onClick={() => setDisputing(true)}
        className="rounded-full border border-sand-300 px-4 py-1.5 text-sm font-medium"
      >
        Dispute
      </button>
    </div>
  );
}
