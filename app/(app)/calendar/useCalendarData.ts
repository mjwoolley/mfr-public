'use client'

import { useQuery } from '@tanstack/react-query'

export interface ReservationRow {
  id: string
  userId: string
  startDate: string
  endDate: string
  status: 'confirmed' | 'cancelled'
  userName: string | null
}

export interface BlockedDateRow {
  id: string
  startDate: string
  endDate: string
  reason: string | null
}

export interface BookingRulesRow {
  id: number
  bookingHorizonDate: string
  maxConsecutiveNights: number
  maxNightsPerUserPerYear: number
}

function windowRange() {
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)).toISOString().slice(0, 10)
  const to = new Date(Date.UTC(now.getUTCFullYear() + 2, 0, 1)).toISOString().slice(0, 10)
  return { from, to }
}

export function useCalendarData() {
  const { from, to } = windowRange()

  const reservationsQuery = useQuery({
    queryKey: ['reservations', from, to],
    queryFn: async (): Promise<ReservationRow[]> => {
      const res = await fetch(`/api/reservations?from=${from}&to=${to}`)
      if (!res.ok) throw new Error('Failed to load reservations')
      const data = await res.json()
      return data.reservations
    },
    refetchOnWindowFocus: true,
  })

  const blockedDatesQuery = useQuery({
    queryKey: ['blockedDates'],
    queryFn: async (): Promise<BlockedDateRow[]> => {
      const res = await fetch('/api/blocked-dates')
      if (!res.ok) throw new Error('Failed to load blocked dates')
      const data = await res.json()
      return data.blockedDates
    },
    refetchOnWindowFocus: true,
  })

  const bookingRulesQuery = useQuery({
    queryKey: ['bookingRules'],
    queryFn: async (): Promise<BookingRulesRow> => {
      const res = await fetch('/api/booking-rules')
      if (!res.ok) throw new Error('Failed to load booking rules')
      const data = await res.json()
      return data.bookingRules
    },
    refetchOnWindowFocus: true,
  })

  return {
    reservations: reservationsQuery.data ?? [],
    blockedDates: blockedDatesQuery.data ?? [],
    bookingRules: bookingRulesQuery.data,
    isLoading: reservationsQuery.isLoading || blockedDatesQuery.isLoading || bookingRulesQuery.isLoading,
    error: reservationsQuery.error ?? blockedDatesQuery.error ?? bookingRulesQuery.error ?? null,
    refetchAll: () => {
      reservationsQuery.refetch()
      blockedDatesQuery.refetch()
      bookingRulesQuery.refetch()
    },
  }
}
