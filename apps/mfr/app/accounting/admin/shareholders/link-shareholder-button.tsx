'use client'

// The per-row Link / Unlink control on Admin → Shareholders.
//
// Picking a login for a shareholder is a judgement call, because a Shareholder
// row is often a household ("John and Michele Anderegg") while a login is one
// person. So the dialog *suggests* rather than decides: logins whose name is
// contained in the shareholder's name are listed first and can be linked in one
// click; anything else needs an explicit confirmation that names the mismatch.
//
// Complements the by-email link at sign-in (lib/auth.ts) and the search-by-email
// control on the shareholder Edit page.

import { useMemo, useState, useTransition } from 'react'
import { ModalDialog } from '@mfr/ui'
import { linkShareholderToUser, unlinkShareholder } from '@/actions/accounting/shareholders'
import { matchesShareholderName } from '@/lib/accounting/nameMatch'

export interface LinkCandidate {
  id: string
  email: string
  name: string | null
  /** Name of the shareholder this login is already linked to, if any. */
  linkedTo: string | null
}

export function LinkShareholderButton({
  shareholderId,
  shareholderName,
  linkedLabel,
  candidates,
}: {
  shareholderId: string
  shareholderName: string
  /** Email/name of the currently linked login, or null when unlinked. */
  linkedLabel: string | null
  candidates: LinkCandidate[]
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [confirming, setConfirming] = useState<LinkCandidate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Suggested first, then the rest; each group alphabetical. Recomputed only
  // when the candidate list or the filter changes.
  const { suggested, others } = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const visible = needle
      ? candidates.filter(
          (c) =>
            c.email.toLowerCase().includes(needle) || (c.name ?? '').toLowerCase().includes(needle),
        )
      : candidates
    const byName = (a: LinkCandidate, b: LinkCandidate) =>
      (a.name ?? a.email).localeCompare(b.name ?? b.email)
    return {
      suggested: visible
        .filter((c) => matchesShareholderName(c.name, shareholderName))
        .sort(byName),
      others: visible.filter((c) => !matchesShareholderName(c.name, shareholderName)).sort(byName),
    }
  }, [candidates, filter, shareholderName])

  function close() {
    setOpen(false)
    setFilter('')
    setConfirming(null)
    setError(null)
  }

  function link(candidate: LinkCandidate) {
    setError(null)
    startTransition(async () => {
      const result = await linkShareholderToUser(shareholderId, candidate.id)
      if (result?.error) {
        setError(result.error)
        setConfirming(null)
        return
      }
      close()
    })
  }

  function unlink() {
    setError(null)
    startTransition(async () => {
      await unlinkShareholder(shareholderId)
      close()
    })
  }

  function renderRow(c: LinkCandidate, isSuggested: boolean) {
    const alreadyLinked = c.linkedTo !== null
    return (
      <li key={c.id} className="flex items-center gap-2 py-1.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{c.name ?? c.email}</span>
          <span className="text-muted block truncate text-xs">
            {c.email}
            {alreadyLinked && ` · already linked to ${c.linkedTo}`}
          </span>
        </span>
        {isSuggested && !alreadyLinked && (
          <span className="tag tag-accent-2 flex-none px-[7px] py-0 text-[10px]">Name matches</span>
        )}
        <button
          type="button"
          className="btn btn-secondary flex-none px-2 py-1 text-xs"
          disabled={isPending || alreadyLinked}
          onClick={() => (isSuggested ? link(c) : setConfirming(c))}
        >
          Link
        </button>
      </li>
    )
  }

  return (
    <>
      {linkedLabel ? (
        <button
          type="button"
          className="btn btn-ghost px-2 py-1 text-xs font-semibold"
          disabled={isPending}
          onClick={unlink}
        >
          Unlink
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-secondary px-2 py-1 text-xs"
          onClick={() => setOpen(true)}
        >
          Link
        </button>
      )}

      {open && (
        <ModalDialog title={`Link a login to ${shareholderName}`} onClose={close}>
          {confirming ? (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-sm">
                <strong>{confirming.name ?? confirming.email}</strong> doesn&apos;t appear in{' '}
                <strong>{shareholderName}</strong>. Link them anyway?
              </p>
              <p className="text-muted m-0 text-xs">
                Linking gives this login access to {shareholderName}&apos;s share balance and
                approvals.
              </p>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirming(null)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isPending}
                  onClick={() => link(confirming)}
                >
                  {isPending ? 'Linking…' : 'Link anyway'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                type="search"
                className="input"
                placeholder="Filter by name or email"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />

              {suggested.length > 0 && (
                <>
                  <p className="text-muted m-0 mt-1 text-xs font-semibold uppercase">Suggested</p>
                  <ul className="m-0 list-none p-0">{suggested.map((c) => renderRow(c, true))}</ul>
                </>
              )}

              {others.length > 0 && (
                <>
                  <p className="text-muted m-0 mt-1 text-xs font-semibold uppercase">
                    {suggested.length > 0 ? 'Everyone else' : 'No name matches — pick manually'}
                  </p>
                  <ul className="m-0 list-none p-0">{others.map((c) => renderRow(c, false))}</ul>
                </>
              )}

              {suggested.length === 0 && others.length === 0 && (
                <p className="text-muted m-0 py-2 text-sm">
                  No registered users match that filter.
                </p>
              )}
            </div>
          )}

          {error && (
            <p
              className="m-0 mt-2 text-[13px] font-semibold"
              style={{ color: 'var(--color-accent-800)' }}
            >
              {error}
            </p>
          )}
        </ModalDialog>
      )}
    </>
  )
}
