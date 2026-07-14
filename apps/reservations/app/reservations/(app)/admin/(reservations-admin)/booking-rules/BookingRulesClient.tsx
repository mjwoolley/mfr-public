'use client'

import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface BookingRules {
  id: number
  bookingHorizonDate: string
  maxConsecutiveNights: number
  maxNightsPerUserPerYear: number
}

export function BookingRulesClient() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['bookingRules'],
    queryFn: async (): Promise<BookingRules> => {
      const res = await fetch('/reservations/api/booking-rules')
      if (!res.ok) throw new Error('Failed to load booking rules')
      const body = await res.json()
      return body.bookingRules
    },
  })

  if (isLoading) return <p className="text-muted p-8 text-center">Loading...</p>
  if (error || !data) {
    return (
      <p className="p-8 text-center font-semibold" style={{ color: 'var(--color-accent-800)' }}>
        Failed to load booking rules.
      </p>
    )
  }

  return <BookingRulesForm initialRules={data} />
}

function BookingRulesForm({ initialRules }: { initialRules: BookingRules }) {
  const queryClient = useQueryClient()
  const [horizonDate, setHorizonDate] = useState(initialRules.bookingHorizonDate)
  const [maxConsecutive, setMaxConsecutive] = useState(String(initialRules.maxConsecutiveNights))
  const [maxYearly, setMaxYearly] = useState(String(initialRules.maxNightsPerUserPerYear))
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSaved(false)
    setSubmitting(true)
    try {
      const res = await fetch('/reservations/api/admin/booking-rules', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bookingHorizonDate: horizonDate,
          maxConsecutiveNights: Number(maxConsecutive),
          maxNightsPerUserPerYear: Number(maxYearly),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setFormError(body.error ?? 'Failed to save booking rules.')
        return
      }
      setSaved(true)
      queryClient.invalidateQueries({ queryKey: ['bookingRules'] })
    } catch {
      setFormError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <p className="text-muted mb-4 text-sm">Set the booking horizon and per-person limits.</p>
      <form onSubmit={handleSubmit} className="card elev-sm max-w-[480px] bg-white px-6 py-5">
        <div className="field">
          <label htmlFor="rules-horizon">Booking horizon — no reservations past this date</label>
          <input
            id="rules-horizon"
            className="input"
            type="date"
            required
            value={horizonDate}
            onChange={(e) => setHorizonDate(e.target.value)}
          />
        </div>
        <div className="field mt-3.5">
          <label htmlFor="rules-max-nights">Max consecutive nights per reservation</label>
          <input
            id="rules-max-nights"
            className="input"
            type="number"
            min={1}
            required
            value={maxConsecutive}
            onChange={(e) => setMaxConsecutive(e.target.value)}
          />
        </div>
        <div className="field mt-3.5">
          <label htmlFor="rules-max-yearly">Max nights per person per calendar year</label>
          <input
            id="rules-max-yearly"
            className="input"
            type="number"
            min={1}
            required
            value={maxYearly}
            onChange={(e) => setMaxYearly(e.target.value)}
          />
        </div>
        {formError && (
          <p
            className="m-0 mt-3 text-[13px] font-semibold"
            style={{ color: 'var(--color-accent-800)' }}
          >
            {formError}
          </p>
        )}
        <div className="mt-5 flex items-center gap-3.5">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
          {saved && (
            <span
              className="text-[13px] font-semibold"
              style={{ color: 'var(--color-accent-2-700)' }}
            >
              Saved.
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
