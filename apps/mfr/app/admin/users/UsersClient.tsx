'use client'

// User Management table (site owner or manager): per-user status buttons
// (approve/block) and, for owners only, the three portal-role toggles, calling
// the actions in ./actions.ts with per-row busy/error state.

import { useState, useTransition } from 'react'
import { setUserStatus, setUserRole, type ActionResult } from './actions'
import type { UserWithRoles } from '@/lib/users'

type RoleKey = 'siteOwner' | 'siteManager' | 'accountingManager'

const ROLES: { key: RoleKey; label: string }[] = [
  { key: 'siteOwner', label: 'Site owner' },
  { key: 'siteManager', label: 'Site manager' },
  { key: 'accountingManager', label: 'Accounting manager' },
]

const STATUS_TAG: Record<UserWithRoles['status'], string> = {
  approved: 'tag-accent-2',
  pending: 'tag-neutral',
  blocked: 'tag-accent',
}

function initials(u: UserWithRoles) {
  const source = (u.name ?? u.email).trim()
  const parts = source.split(/\s+/)
  const chars = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2)
  return chars.toUpperCase()
}

export function UsersClient({
  users,
  currentUserId,
  viewerIsOwner,
}: {
  users: UserWithRoles[]
  currentUserId: string
  viewerIsOwner: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function run(userId: string, fn: () => Promise<ActionResult>) {
    setError(null)
    setBusyId(userId)
    startTransition(async () => {
      const res = await fn()
      if (res && 'error' in res) setError(res.error)
      setBusyId(null)
    })
  }

  return (
    <div className="mt-7 flex flex-col gap-4">
      {error && (
        <div
          className="card elev-sm px-4 py-3 text-sm"
          style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-800)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      {users.map((u) => {
        const isSelf = u.id === currentUserId
        const rowBusy = isPending && busyId === u.id
        // A manager can't change an owner's status (server enforces this too).
        const targetLocked = !viewerIsOwner && u.siteOwner
        return (
          <div key={u.id} className="card elev-sm bg-white gap-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white"
                style={{ background: 'var(--color-accent-600)' }}
                aria-hidden
              >
                {initials(u)}
              </span>
              <div className="min-w-0">
                <div className="font-semibold">
                  {u.name ?? u.email.split('@')[0]}
                  {isSelf && <span className="text-muted"> (you)</span>}
                </div>
                <div className="text-muted truncate text-sm">{u.email}</div>
              </div>
              <span className={`tag ${STATUS_TAG[u.status]} ml-auto`}>{u.status}</span>
            </div>

            <div
              className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-4"
              style={{ borderColor: 'var(--color-neutral-200)' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-muted text-xs font-bold tracking-wide uppercase">Access</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={rowBusy || isSelf || targetLocked || u.status === 'approved'}
                  onClick={() =>
                    run(u.id, () => setUserStatus({ userId: u.id, status: 'approved' }))
                  }
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={rowBusy || isSelf || targetLocked || u.status === 'blocked'}
                  onClick={() =>
                    run(u.id, () => setUserStatus({ userId: u.id, status: 'blocked' }))
                  }
                >
                  Block
                </button>
              </div>

              {viewerIsOwner && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted text-xs font-bold tracking-wide uppercase">
                    Roles
                  </span>
                  {ROLES.map(({ key, label }) => {
                    const on = u[key]
                    const lockSelfOwner = isSelf && key === 'siteOwner' && on
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={on}
                        disabled={rowBusy || lockSelfOwner}
                        onClick={() =>
                          run(u.id, () => setUserRole({ userId: u.id, role: key, value: !on }))
                        }
                        className="btn"
                        style={
                          on
                            ? { background: 'var(--color-accent-2)', color: '#fff' }
                            : {
                                border: '1.5px solid var(--color-neutral-300)',
                                color: 'var(--color-text)',
                              }
                        }
                      >
                        {on ? '✓ ' : ''}
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {users.length === 0 && (
        <div className="card elev-sm bg-white text-muted px-4 py-8 text-center">No users yet.</div>
      )}
    </div>
  )
}
