'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface AdminUser {
  id: string
  email: string
  name: string | null
  status: 'pending' | 'approved' | 'blocked'
  isReservationsAdmin: boolean
  isAccountingAdmin: boolean
  createdAt: string
}

type UserPatch = { status: 'approved' | 'blocked' } | { isReservationsAdmin: boolean } | { isAccountingAdmin: boolean }

interface UsersClientProps {
  actorIsReservationsAdmin: boolean
  actorIsAccountingAdmin: boolean
}

function statusTag(status: AdminUser['status']): { className: string; label: string } {
  if (status === 'approved') return { className: 'tag tag-accent-2', label: 'Approved' }
  if (status === 'pending') return { className: 'tag tag-accent', label: 'Pending' }
  return { className: 'tag tag-neutral', label: 'Blocked' }
}

function UserRow({
  user,
  actorIsReservationsAdmin,
  actorIsAccountingAdmin,
  updating,
  rowError,
  onUpdate,
}: {
  user: AdminUser
  actorIsReservationsAdmin: boolean
  actorIsAccountingAdmin: boolean
  updating: boolean
  rowError: string | null
  onUpdate: (id: string, patch: UserPatch) => void
}) {
  const tag = statusTag(user.status)
  const displayName = user.name ?? user.email

  return (
    <div
      className="card elev-sm px-4 py-3.5"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}
    >
      <span
        className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[15px]"
        style={{
          background: 'var(--color-accent-100)',
          color: 'var(--color-accent-700)',
          fontFamily: 'var(--font-heading)',
        }}
      >
        {displayName.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">
          {displayName}
          {user.isReservationsAdmin && (
            <span className="tag tag-outline ml-2 px-2 py-0 text-[10px]">Reservations admin</span>
          )}
          {user.isAccountingAdmin && (
            <span className="tag tag-outline ml-2 px-2 py-0 text-[10px]">Accounting admin</span>
          )}
        </div>
        <div className="text-muted text-[13px]">{user.email}</div>
        {rowError && (
          <p className="m-0 mt-1 text-[13px] font-semibold" style={{ color: 'var(--color-accent-800)' }}>
            {rowError}
          </p>
        )}
      </div>
      <span className={tag.className}>{tag.label}</span>
      <div className="flex flex-none flex-wrap justify-end gap-2">
        {user.status !== 'approved' && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onUpdate(user.id, { status: 'approved' })}
            disabled={updating}
          >
            Approve
          </button>
        )}
        {user.status !== 'blocked' && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ color: 'var(--color-accent-800)' }}
            onClick={() => onUpdate(user.id, { status: 'blocked' })}
            disabled={updating}
          >
            Block
          </button>
        )}
        {actorIsReservationsAdmin && (
          <button
            type="button"
            className="btn btn-ghost text-xs"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
            onClick={() => onUpdate(user.id, { isReservationsAdmin: !user.isReservationsAdmin })}
            disabled={updating}
          >
            {user.isReservationsAdmin ? 'Revoke reservations admin' : 'Make reservations admin'}
          </button>
        )}
        {actorIsAccountingAdmin && (
          <button
            type="button"
            className="btn btn-ghost text-xs"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
            onClick={() => onUpdate(user.id, { isAccountingAdmin: !user.isAccountingAdmin })}
            disabled={updating}
          >
            {user.isAccountingAdmin ? 'Revoke accounting admin' : 'Make accounting admin'}
          </button>
        )}
      </div>
    </div>
  )
}

export function UsersClient({ actorIsReservationsAdmin, actorIsAccountingAdmin }: UsersClientProps) {
  const queryClient = useQueryClient()
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async (): Promise<AdminUser[]> => {
      const res = await fetch('/reservations/api/admin/users')
      if (!res.ok) throw new Error('Failed to load users')
      const body = await res.json()
      return body.users
    },
  })

  async function updateUser(id: string, patch: UserPatch) {
    setUpdatingId(id)
    setRowError((prev) => (prev?.id === id ? null : prev))
    try {
      const res = await fetch(`/reservations/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setRowError({ id, message: body.error ?? 'Failed to update user.' })
        return
      }
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    } catch {
      setRowError({ id, message: 'Network error — please try again.' })
    } finally {
      setUpdatingId(null)
    }
  }

  if (isLoading) return <p className="text-muted p-8 text-center">Loading...</p>
  if (error) {
    return (
      <p className="p-8 text-center font-semibold" style={{ color: 'var(--color-accent-800)' }}>
        Failed to load users.
      </p>
    )
  }

  const pending = data?.filter((u) => u.status === 'pending') ?? []
  const others = data?.filter((u) => u.status !== 'pending') ?? []

  return (
    <div>
      <p className="text-muted mb-4 text-sm">Approve pending signups and manage access.</p>
      <section className="mb-6">
        <h2 className="text-muted mb-2 text-[11px] font-bold tracking-[0.08em] uppercase" style={{ fontFamily: 'var(--font-body)' }}>
          Pending approval
        </h2>
        {pending.length === 0 && <p className="text-muted text-sm">No pending users.</p>}
        <div className="flex flex-col gap-2.5">
          {pending.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              actorIsReservationsAdmin={actorIsReservationsAdmin}
              actorIsAccountingAdmin={actorIsAccountingAdmin}
              updating={updatingId === u.id}
              rowError={rowError?.id === u.id ? rowError.message : null}
              onUpdate={updateUser}
            />
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-muted mb-2 text-[11px] font-bold tracking-[0.08em] uppercase" style={{ fontFamily: 'var(--font-body)' }}>
          All users
        </h2>
        <div className="flex flex-col gap-2.5">
          {others.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              actorIsReservationsAdmin={actorIsReservationsAdmin}
              actorIsAccountingAdmin={actorIsAccountingAdmin}
              updating={updatingId === u.id}
              rowError={rowError?.id === u.id ? rowError.message : null}
              onUpdate={updateUser}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
