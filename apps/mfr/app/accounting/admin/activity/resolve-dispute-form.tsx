'use client'

import { useState, useTransition } from 'react'
import { resolveDispute } from '@/actions/accounting/approvals'

export function ResolveDisputeForm({ approvalId }: { approvalId: string }) {
  const [open, setOpen] = useState(false)
  const [resolutionTransactionId, setResolutionTransactionId] = useState('')
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer text-xs font-semibold underline underline-offset-[3px]"
        style={{ color: 'var(--color-accent)' }}
      >
        Mark resolved
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        startTransition(async () => {
          await resolveDispute(approvalId, resolutionTransactionId || undefined)
          setOpen(false)
        })
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        type="text"
        value={resolutionTransactionId}
        onChange={(e) => setResolutionTransactionId(e.target.value)}
        placeholder="Correction transaction id (optional)"
        className="input max-w-[280px] text-xs"
        style={{ minHeight: 30 }}
      />
      <button type="submit" disabled={pending} className="btn btn-primary px-3 py-1 text-xs">
        {pending ? 'Saving…' : 'Confirm resolved'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="btn btn-ghost px-2 py-1 text-xs"
        style={{ fontFamily: 'var(--font-body)' }}
      >
        Cancel
      </button>
    </form>
  )
}
