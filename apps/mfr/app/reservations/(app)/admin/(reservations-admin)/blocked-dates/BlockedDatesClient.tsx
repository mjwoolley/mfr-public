'use client'

// Admin blocked-dates screen: add/remove blocked ranges against the admin
// API; a 409 here means the range collides with an existing reservation
// (enforced by DB triggers, not client checks).

import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { niceRange } from '../../../calendar/formatDates'

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
    <div>
      <p className="text-muted mb-4 text-sm">
        Block off dates the cabin is unavailable — these can&apos;t be booked.
      </p>

      <form onSubmit={handleCreate} className="card elev-sm mb-5 bg-white px-6 py-5">
        <div className="flex flex-wrap gap-3">
          <div className="field min-w-[150px] flex-1">
            <label htmlFor="bd-start">Start date</label>
            <input
              id="bd-start"
              className="input"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="field min-w-[150px] flex-1">
            <label htmlFor="bd-end">End date</label>
            <input
              id="bd-end"
              className="input"
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <div className="field mt-3">
          <label htmlFor="bd-reason">Reason (optional)</label>
          <input
            id="bd-reason"
            className="input"
            type="text"
            placeholder="e.g. Dock maintenance"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {formError && (
          <p
            className="m-0 mt-2 text-[13px] font-semibold"
            style={{ color: 'var(--color-accent-800)' }}
          >
            {formError}
          </p>
        )}
        <div className="mt-3">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {submitting ? 'Adding…' : 'Block these dates'}
          </button>
        </div>
      </form>

      {isLoading && <p className="text-muted">Loading...</p>}
      {error && (
        <p className="font-semibold" style={{ color: 'var(--color-accent-800)' }}>
          Failed to load blocked dates.
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        {data?.map((b) => (
          <div
            key={b.id}
            className="card elev-sm px-4 py-3.5"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
          >
            <span
              className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full"
              style={{ background: 'var(--color-neutral-200)', color: 'var(--color-neutral-700)' }}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18M10 14l4 4M14 14l-4 4" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{niceRange(b.startDate, b.endDate)}</div>
              {b.reason && <div className="text-muted text-[13px]">{b.reason}</div>}
              {rowError?.id === b.id && (
                <p
                  className="m-0 mt-1 text-[13px] font-semibold"
                  style={{ color: 'var(--color-accent-800)' }}
                >
                  {rowError.message}
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn btn-secondary flex-none"
              style={{ color: 'var(--color-accent-800)' }}
              onClick={() => handleDelete(b.id)}
              disabled={deletingId === b.id}
            >
              {deletingId === b.id ? 'Removing…' : 'Remove'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
