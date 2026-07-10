'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface BookingRules {
  id: number
  bookingHorizonDate: string
  maxConsecutiveNights: number
  maxNightsPerUserPerYear: number
}

export function BookingRulesClient() {
  const queryClient = useQueryClient()
  const [horizonDate, setHorizonDate] = useState('')
  const [maxConsecutive, setMaxConsecutive] = useState('')
  const [maxYearly, setMaxYearly] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['bookingRules'],
    queryFn: async (): Promise<BookingRules> => {
      const res = await fetch('/reservations/api/booking-rules')
      if (!res.ok) throw new Error('Failed to load booking rules')
      const body = await res.json()
      return body.bookingRules
    },
  })

  useEffect(() => {
    if (data) {
      setHorizonDate(data.bookingHorizonDate)
      setMaxConsecutive(String(data.maxConsecutiveNights))
      setMaxYearly(String(data.maxNightsPerUserPerYear))
    }
  }, [data])

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

  if (isLoading) return <p className="p-8 text-center text-stone-500">Loading...</p>
  if (error) return <p className="p-8 text-center text-red-600">Failed to load booking rules.</p>

  return (
    <div className="mx-auto max-w-md p-4">
      <h1 className="mb-4 text-xl font-semibold text-stone-900">Booking Rules</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            Booking horizon date (no reservations past this date)
          </label>
          <input
            type="date"
            required
            value={horizonDate}
            onChange={(e) => setHorizonDate(e.target.value)}
            className="w-full rounded border px-2 py-1 text-sm text-stone-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            Max consecutive nights per reservation
          </label>
          <input
            type="number"
            min={1}
            required
            value={maxConsecutive}
            onChange={(e) => setMaxConsecutive(e.target.value)}
            className="w-full rounded border px-2 py-1 text-sm text-stone-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            Max nights per user per calendar year
          </label>
          <input
            type="number"
            min={1}
            required
            value={maxYearly}
            onChange={(e) => setMaxYearly(e.target.value)}
            className="w-full rounded border px-2 py-1 text-sm text-stone-900"
          />
        </div>
        {formError && <p className="text-sm text-red-700">{formError}</p>}
        {saved && <p className="text-sm text-green-700">Saved.</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-lake-600 px-4 py-2 text-sm font-medium text-white hover:bg-lake-700 disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}
