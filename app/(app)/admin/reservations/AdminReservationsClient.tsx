'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface Reservation {
  id: string
  userId: string
  startDate: string
  endDate: string
  status: 'confirmed' | 'cancelled'
  userName: string | null
}

function reservationWindow() {
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)).toISOString().slice(0, 10)
  const to = new Date(Date.UTC(now.getUTCFullYear() + 2, 0, 1)).toISOString().slice(0, 10)
  return { from, to }
}

export function AdminReservationsClient() {
  const queryClient = useQueryClient()
  const { from, to } = reservationWindow()
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reservations', from, to],
    queryFn: async (): Promise<Reservation[]> => {
      const res = await fetch(`/api/reservations?from=${from}&to=${to}`)
      if (!res.ok) throw new Error('Failed to load reservations')
      const body = await res.json()
      return body.reservations
    },
  })

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['reservations'] })
    queryClient.invalidateQueries({ queryKey: ['my-reservations'] })
  }

  function clearRowError(id: string) {
    setRowError((prev) => (prev?.id === id ? null : prev))
  }

  async function handleCancel(id: string) {
    setCancellingId(id)
    clearRowError(id)
    try {
      const res = await fetch(`/api/reservations/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setRowError({ id, message: body.error ?? 'Failed to cancel reservation.' })
        return
      }
      invalidateAll()
    } catch {
      setRowError({ id, message: 'Network error — please try again.' })
    } finally {
      setCancellingId(null)
    }
  }

  function startEdit(r: Reservation) {
    setEditingId(r.id)
    setEditStart(r.startDate)
    setEditEnd(r.endDate)
    clearRowError(r.id)
  }

  async function submitEdit(id: string) {
    clearRowError(id)
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startDate: editStart, endDate: editEnd }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setRowError({ id, message: body.error ?? 'Failed to update reservation.' })
        return
      }
      setEditingId(null)
      invalidateAll()
    } catch {
      setRowError({ id, message: 'Network error — please try again.' })
    }
  }

  if (isLoading) return <p className="p-8 text-center text-gray-500">Loading...</p>
  if (error) return <p className="p-8 text-center text-red-600">Failed to load reservations.</p>

  const sorted = [...(data ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate))

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-semibold text-gray-900">All Reservations</h1>
      {sorted.length === 0 && <p className="text-gray-500">No reservations in range.</p>}
      <ul className="space-y-2">
        {sorted.map((r) => (
          <li key={r.id} className="rounded border p-3">
            {editingId === r.id ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-900">{r.userName ?? 'Unknown user'}</p>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={editStart}
                    onChange={(e) => setEditStart(e.target.value)}
                    className="rounded border px-2 py-1 text-sm"
                  />
                  <input
                    type="date"
                    value={editEnd}
                    onChange={(e) => setEditEnd(e.target.value)}
                    className="rounded border px-2 py-1 text-sm"
                  />
                </div>
                {rowError?.id === r.id && <p className="text-sm text-red-700">{rowError.message}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => submitEdit(r.id)}
                    className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
                  >
                    Cancel edit
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-900">
                    {r.userName ?? 'Unknown user'}: {r.startDate} &rarr; {r.endDate}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(r)}
                      className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleCancel(r.id)}
                      disabled={cancellingId === r.id}
                      className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {cancellingId === r.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  </div>
                </div>
                {rowError?.id === r.id && <p className="mt-1 text-sm text-red-700">{rowError.message}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
