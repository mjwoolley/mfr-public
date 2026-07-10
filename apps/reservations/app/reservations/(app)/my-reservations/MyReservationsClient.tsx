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

export function MyReservationsClient({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelErrorId, setCancelErrorId] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['my-reservations', userId],
    queryFn: async (): Promise<Reservation[]> => {
      const today = new Date().toISOString().slice(0, 10)
      const farFuture = '2099-12-31'
      const res = await fetch(`/reservations/api/reservations?from=${today}&to=${farFuture}`)
      if (!res.ok) throw new Error('Failed to load reservations')
      const body = await res.json()
      return (body.reservations as Reservation[]).filter((r) => r.userId === userId)
    },
  })

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['my-reservations'] })
    queryClient.invalidateQueries({ queryKey: ['reservations'] })
  }

  async function handleCancel(id: string) {
    setCancellingId(id)
    setCancelError(null)
    setCancelErrorId(null)
    try {
      const res = await fetch(`/reservations/api/reservations/${id}`, { method: 'DELETE' })
      if (res.ok) {
        invalidateAll()
      } else {
        const body = await res.json().catch(() => ({}))
        setCancelError(body.error ?? 'Failed to cancel reservation.')
        setCancelErrorId(id)
      }
    } catch {
      setCancelError('Network error — please try again.')
      setCancelErrorId(id)
    } finally {
      setCancellingId(null)
    }
  }

  function startEdit(r: Reservation) {
    setEditingId(r.id)
    setEditStart(r.startDate)
    setEditEnd(r.endDate)
    setEditError(null)
    if (cancelErrorId === r.id) {
      setCancelError(null)
      setCancelErrorId(null)
    }
  }

  async function submitEdit(id: string) {
    setEditError(null)
    try {
      const res = await fetch(`/reservations/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startDate: editStart, endDate: editEnd }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setEditError(body.error ?? 'Failed to update reservation.')
        return
      }
      setEditingId(null)
      invalidateAll()
    } catch {
      setEditError('Network error — please try again.')
    }
  }

  if (isLoading) return <p className="p-8 text-center text-stone-500">Loading...</p>
  if (error) return <p className="p-8 text-center text-red-600">Failed to load your reservations.</p>

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-semibold">My Reservations</h1>
      {data && data.length === 0 && <p className="text-stone-500">You have no upcoming reservations.</p>}
      <ul className="space-y-2">
        {data?.map((r) => (
          <li key={r.id} className="rounded border p-3">
            {editingId === r.id ? (
              <div className="space-y-2">
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
                {editError && <p className="text-sm text-red-700">{editError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => submitEdit(r.id)}
                    className="rounded bg-lake-600 px-3 py-1 text-sm text-white hover:bg-lake-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded px-3 py-1 text-sm text-stone-600 hover:bg-stone-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <span>
                    {r.startDate} &rarr; {r.endDate}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(r)}
                      className="rounded px-3 py-1 text-sm text-lake-600 hover:bg-lake-50"
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
                {cancelErrorId === r.id && cancelError && (
                  <p className="mt-1 text-sm text-red-700">{cancelError}</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
