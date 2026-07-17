'use client'

import { useQueryClient } from '@tanstack/react-query'

export interface MutationResult {
  ok: boolean
  error?: string
}

/**
 * The three reservation write paths, shared by the calendar dialogs and the
 * My Reservations page so both surfaces hit the same endpoints and refresh
 * the same query caches. Server-side validation (rules engine) remains the
 * source of truth; errors come back as `{ ok: false, error }` for inline
 * display.
 */
export function useReservationMutations() {
  const queryClient = useQueryClient()

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['reservations'] })
    queryClient.invalidateQueries({ queryKey: ['my-reservations'] })
  }

  async function createReservation(
    startDate: string,
    endDate: string,
    // Admin-only: create the reservation for this member instead of the
    // signed-in user. The API re-checks that the actor is a reservations admin.
    forUserId?: string,
  ): Promise<MutationResult> {
    try {
      const res = await fetch('/reservations/api/reservations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, ...(forUserId ? { userId: forUserId } : {}) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return { ok: false, error: body.error ?? 'Failed to create reservation.' }
      }
      invalidateAll()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Network error — please try again.' }
    }
  }

  async function updateReservation(
    id: string,
    startDate: string,
    endDate: string,
  ): Promise<MutationResult> {
    try {
      const res = await fetch(`/reservations/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return { ok: false, error: body.error ?? 'Failed to update reservation.' }
      }
      invalidateAll()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Network error — please try again.' }
    }
  }

  async function cancelReservation(id: string): Promise<MutationResult> {
    try {
      const res = await fetch(`/reservations/api/reservations/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return { ok: false, error: body.error ?? 'Failed to cancel reservation.' }
      }
      invalidateAll()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Network error — please try again.' }
    }
  }

  return { createReservation, updateReservation, cancelReservation }
}
