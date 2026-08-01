'use client'

// Links a Shareholder record to a Google login.
//
// A Shareholder row is often a household ("John and Michele Anderegg") while a
// login is one person, so the picker *suggests* rather than decides: logins
// whose name appears in the shareholder's name are grouped first and link
// straight away, and anything else has to be confirmed against a message that
// names the mismatch. The split itself is computed on the server (see page.tsx).
//
// Only logins not already attached to another shareholder are offered —
// `Shareholder.userId` is unique, so linking one twice would fail anyway.
//
// Linking also decides what happens to the shareholder's own email. A blank one
// is filled in silently; one that differs from the login's raises a choice,
// because a household row carrying the other spouse's address must not lose it
// just to link somebody. The server re-derives all of this — the flag sent from
// here only answers the "they differ" case.

import { useState, useTransition } from 'react'
import { linkShareholderToUser, unlinkShareholder } from '@/actions/accounting/shareholders'
import type { LoginOption } from '@/lib/accounting/linkCandidates'

const label = (o: LoginOption) => (o.name ? `${o.name} — ${o.email}` : o.email)

export function LinkLoginControl({
  shareholderId,
  shareholderName,
  shareholderEmail,
  linkedLogin,
  suggested,
  others,
}: {
  shareholderId: string
  shareholderName: string
  shareholderEmail: string | null
  linkedLogin: LoginOption | null
  suggested: LoginOption[]
  others: LoginOption[]
}) {
  const [selectedId, setSelectedId] = useState('')
  const [confirming, setConfirming] = useState<LoginOption | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const options = [...suggested, ...others]
  const selected = options.find((o) => o.id === selectedId) ?? null

  const nameMismatch = (o: LoginOption) => !suggested.some((s) => s.id === o.id)
  const emailDiffers = (o: LoginOption) =>
    !!shareholderEmail && o.email.trim().toLowerCase() !== shareholderEmail.trim().toLowerCase()

  function link(option: LoginOption, adoptEmail = false) {
    setError(null)
    startTransition(async () => {
      const result = await linkShareholderToUser(shareholderId, option.id, { adoptEmail })
      if (result?.error) {
        setError(result.error)
        setConfirming(null)
        return
      }
      setSelectedId('')
      setConfirming(null)
    })
  }

  function onLinkClick() {
    if (!selected) return
    // Anything questionable gets a deliberate second step: a wrong link hands
    // someone another family's balance, and adopting the email overwrites a
    // record the admin may not have meant to touch.
    if (nameMismatch(selected) || emailDiffers(selected)) setConfirming(selected)
    else link(selected)
  }

  function unlink() {
    setError(null)
    startTransition(async () => {
      await unlinkShareholder(shareholderId)
    })
  }

  return (
    <div className="mt-2 max-w-sm pt-6" style={{ borderTop: '1px solid var(--color-divider)' }}>
      <h2 className="text-base">Linked login</h2>

      {linkedLogin ? (
        <>
          <p className="text-muted mt-1 text-sm">
            Linked to {linkedLogin.name ? `${linkedLogin.name} — ` : ''}
            <span className="break-all">{linkedLogin.email}</span>
          </p>
          <button
            type="button"
            onClick={unlink}
            disabled={isPending}
            className="mt-2 cursor-pointer text-sm font-semibold underline underline-offset-[3px] disabled:opacity-50"
            style={{ color: 'var(--color-accent)' }}
          >
            Unlink
          </button>
        </>
      ) : confirming ? (
        <div className="mt-2 flex flex-col gap-3">
          {nameMismatch(confirming) && (
            <p className="m-0 text-sm">
              <strong>{confirming.name ?? confirming.email}</strong> doesn&apos;t appear in{' '}
              <strong>{shareholderName}</strong>. Link them anyway?
            </p>
          )}
          {emailDiffers(confirming) && (
            <p className="m-0 text-sm">
              This login&apos;s email differs from the shareholder&apos;s:
              <span className="text-muted mt-1 block text-xs break-all">
                shareholder <strong>{shareholderEmail}</strong>
                <br />
                login <strong>{confirming.email}</strong>
              </span>
            </p>
          )}
          <p className="text-muted m-0 text-xs">
            Linking gives this login access to {shareholderName}&apos;s share balance and approvals.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirming(null)}
              disabled={isPending}
            >
              Back
            </button>
            {emailDiffers(confirming) ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => link(confirming, false)}
                  disabled={isPending}
                >
                  {isPending ? 'Linking…' : `Link, keep ${shareholderEmail}`}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => link(confirming, true)}
                  disabled={isPending}
                >
                  {isPending ? 'Linking…' : `Link and use ${confirming.email}`}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => link(confirming)}
                disabled={isPending}
              >
                {isPending ? 'Linking…' : 'Link anyway'}
              </button>
            )}
          </div>
        </div>
      ) : options.length === 0 ? (
        <p className="text-muted mt-1 text-sm">
          Not linked. Every approved login is already linked to another shareholder.
        </p>
      ) : (
        <>
          <p className="text-muted mt-1 text-sm">Not linked.</p>
          <div className="field mt-3">
            <label htmlFor="link-login">Link a login</label>
            <select
              id="link-login"
              className="input"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Select a login…</option>
              {suggested.length > 0 && (
                <optgroup label="Suggested — name matches">
                  {suggested.map((o) => (
                    <option key={o.id} value={o.id}>
                      {label(o)}
                    </option>
                  ))}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label={suggested.length > 0 ? 'Everyone else' : 'No name matches'}>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {label(o)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primary mt-2"
            onClick={onLinkClick}
            disabled={isPending || !selected}
          >
            {isPending ? 'Linking…' : 'Link'}
          </button>
        </>
      )}

      {error && (
        <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--color-accent-800)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
