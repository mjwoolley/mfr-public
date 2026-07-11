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
        className="mt-1 flex flex-col gap-2"
      >
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          rows={2}
          placeholder="Why are you disputing this?"
          className="input text-sm"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending || !reason.trim()}
            className="btn btn-primary"
            style={{ background: "var(--color-accent-800)" }}
          >
            {pending ? "Submitting…" : "Submit dispute"}
          </button>
          <button type="button" onClick={() => setDisputing(false)} className="btn btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-1 flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => { await confirmTransaction(approvalId); })}
        className="btn btn-primary"
      >
        Confirm
      </button>
      <button type="button" onClick={() => setDisputing(true)} className="btn btn-secondary">
        Dispute
      </button>
    </div>
  );
}
