'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface AdminUser {
  id: string
  email: string
  name: string | null
  status: 'pending' | 'approved' | 'blocked'
  isAdmin: boolean
  createdAt: string
}

function UserRow({
  user,
  updating,
  rowError,
  onUpdateStatus,
}: {
  user: AdminUser
  updating: boolean
  rowError: string | null
  onUpdateStatus: (id: string, status: 'approved' | 'blocked') => void
}) {
  return (
    <li className="rounded border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900">{user.name ?? user.email}</p>
          <p className="text-sm text-gray-500">
            {user.email} &middot; {user.status}
            {user.isAdmin ? ' · admin' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {user.status !== 'approved' && (
            <button
              onClick={() => onUpdateStatus(user.id, 'approved')}
              disabled={updating}
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Approve
            </button>
          )}
          {user.status !== 'blocked' && (
            <button
              onClick={() => onUpdateStatus(user.id, 'blocked')}
              disabled={updating}
              className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Block
            </button>
          )}
        </div>
      </div>
      {rowError && <p className="mt-1 text-sm text-red-700">{rowError}</p>}
    </li>
  )
}

export function UsersClient() {
  const queryClient = useQueryClient()
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async (): Promise<AdminUser[]> => {
      const res = await fetch('/api/admin/users')
      if (!res.ok) throw new Error('Failed to load users')
      const body = await res.json()
      return body.users
    },
  })

  async function updateStatus(id: string, status: 'approved' | 'blocked') {
    setUpdatingId(id)
    setRowError((prev) => (prev?.id === id ? null : prev))
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
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

  if (isLoading) return <p className="p-8 text-center text-gray-500">Loading...</p>
  if (error) return <p className="p-8 text-center text-red-600">Failed to load users.</p>

  const pending = data?.filter((u) => u.status === 'pending') ?? []
  const others = data?.filter((u) => u.status !== 'pending') ?? []

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Manage Users</h1>
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-500 uppercase">Pending approval</h2>
        {pending.length === 0 && <p className="text-sm text-gray-500">No pending users.</p>}
        <ul className="space-y-2">
          {pending.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              updating={updatingId === u.id}
              rowError={rowError?.id === u.id ? rowError.message : null}
              onUpdateStatus={updateStatus}
            />
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-500 uppercase">All users</h2>
        <ul className="space-y-2">
          {others.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              updating={updatingId === u.id}
              rowError={rowError?.id === u.id ? rowError.message : null}
              onUpdateStatus={updateStatus}
            />
          ))}
        </ul>
      </section>
    </div>
  )
}
