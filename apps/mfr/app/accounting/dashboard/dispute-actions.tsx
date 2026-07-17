'use client'

import { useState, useTransition } from 'react'
import { confirmTransaction, updateDisputeReason } from '@/actions/accounting/approvals'

export function DisputeEntryActions({
  approvalId,
  disputeReason,
}: {
  approvalId: string
  disputeReason: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [reason, setReason] = useState(disputeReason ?? '')
  const [pending, startTransition] = useTransition()

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          startTransition(async () => {
            await updateDisputeReason(approvalId, reason)
            setEditing(false)
          })
        }}
        className="mt-2 flex flex-col gap-2"
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
          <button type="submit" disabled={pending || !reason.trim()} className="btn btn-primary">
            {pending ? 'Saving…' : 'Save reason'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await confirmTransaction(approvalId)
          })
        }
        className="btn btn-primary"
      >
        {pending ? 'Confirming…' : 'Confirm anyway'}
      </button>
      <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary">
        Edit reason
      </button>
    </div>
  )
}
