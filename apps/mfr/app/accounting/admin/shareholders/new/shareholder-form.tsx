'use client'

import { useActionState } from 'react'
import { createShareholder, type ActionState } from '@/actions/accounting/shareholders'

export function ShareholderForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createShareholder,
    undefined,
  )

  return (
    <form
      action={formAction}
      className="card elev-sm mt-5 flex max-w-sm flex-col gap-3.5 bg-white px-6 py-5"
    >
      <div className="field">
        <label htmlFor="sh-name">Name</label>
        <input id="sh-name" name="name" required className="input" />
      </div>
      <div className="field">
        <label htmlFor="sh-email">Email (optional)</label>
        <input id="sh-email" name="email" type="email" className="input" />
      </div>
      {state?.error && (
        <p className="m-0 text-[13px] font-semibold" style={{ color: 'var(--color-accent-800)' }}>
          {state.error}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Adding…' : 'Add shareholder'}
        </button>
      </div>
    </form>
  )
}
