'use client'

import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface BlockedDate {
  id: string
  startDate: string
  endDate: string
  reason: string | null
}

export function BlockedDatesClient() {
  const queryClient = useQueryClient()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['blockedDates'],
    queryFn: async (): Promise<BlockedDate[]> => {
      const res = await fetch('/reservations/api/blocked-dates')
      if (!res.ok) throw new Error('Failed to load blocked dates')
      const body = await res.json()
      return body.blockedDates
    },
  })

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/reservations/api/admin/blocked-dates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, reason: reason || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setFormError(body.error ?? 'Failed to add blocked dates.')
        return
      }
      setStartDate('')
      setEndDate('')
      setReason('')
      queryClient.invalidateQueries({ queryKey: ['blockedDates'] })
    } catch {
      setFormError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setRowError((prev) => (prev?.id === id ? null : prev))
    try {
      const res = await fetch(`/reservations/api/admin/blocked-dates/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setRowError({ id, message: body.error ?? 'Failed to remove blocked dates.' })
        return
      }
      queryClient.invalidateQueries({ queryKey: ['blockedDates'] })
    } catch {
      setRowError({ id, message: 'Network error — please try again.' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-semibold text-stone-900">Blocked Dates</h1>

      <form onSubmit={handleCreate} className="mb-6 space-y-2 rounded border p-3">
        <div className="flex gap-2">
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border px-2 py-1 text-sm text-stone-900"
          />
          <input
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded border px-2 py-1 text-sm text-stone-900"
          />
        </div>
        <input
          type="text"
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded border px-2 py-1 text-sm text-stone-900"
        />
        {formError && <p className="text-sm text-red-700">{formError}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-lake-600 px-4 py-2 text-sm font-medium text-white hover:bg-lake-700 disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add blocked dates'}
        </button>
      </form>

      {isLoading && <p className="text-stone-500">Loading...</p>}
      {error && <p className="text-red-600">Failed to load blocked dates.</p>}
      <ul className="space-y-2">
        {data?.map((b) => (
          <li key={b.id} className="rounded border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-stone-900">
                {b.startDate} &rarr; {b.endDate}
                {b.reason ? ` · ${b.reason}` : ''}
              </span>
              <button
                onClick={() => handleDelete(b.id)}
                disabled={deletingId === b.id}
                className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {deletingId === b.id ? 'Removing...' : 'Remove'}
              </button>
            </div>
            {rowError?.id === b.id && <p className="mt-1 text-sm text-red-700">{rowError.message}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}
