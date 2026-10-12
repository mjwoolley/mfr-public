// @vitest-environment happy-dom
// Requirement tests for the admin Booking Rules screen (CAP-027): the real
// BookingRulesClient with the booking-rules API answered by an in-memory
// fake. Server-side behaviour (activity entry, admin-only, existing stays
// untouched) is covered in tests/reservations-integration/requirements-admin.test.ts.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, screen, fireEvent } from '@testing-library/react'
import { BookingRulesClient } from './BookingRulesClient'
import { installFetch, renderWithQuery, backgroundRules } from '@/tests/reservations-ui/harness'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const HORIZON = 'Booking horizon — no reservations past this date'
const MAX_STAY = 'Max consecutive nights per reservation'
const MAX_YEAR = 'Max nights per person per calendar year'

function setup() {
  const patches: unknown[] = []
  installFetch({
    'GET /reservations/api/booking-rules': () => ({ body: { bookingRules: backgroundRules } }),
    'PATCH /reservations/api/admin/booking-rules': ({ body }) => {
      patches.push(body)
      return { body: { bookingRules: { ...backgroundRules, ...(body as object) } } }
    },
  })
  renderWithQuery(<BookingRulesClient />)
  return { patches }
}

describe('CAP-027 Booking rules settings', () => {
  it('CAP-027 · I see the current rules', async () => {
    setup()
    expect(await screen.findByText('Set the booking horizon and per-person limits.')).toBeTruthy()
    expect((screen.getByLabelText(HORIZON) as HTMLInputElement).value).toBe('2030-12-31')
    expect((screen.getByLabelText(MAX_STAY) as HTMLInputElement).value).toBe('14')
    expect((screen.getByLabelText(MAX_YEAR) as HTMLInputElement).value).toBe('60')
  })

  it('CAP-027 · Night limits must be at least 1 on the form (0 will not submit)', async () => {
    const { patches } = setup()
    const input = (await screen.findByLabelText(MAX_STAY)) as HTMLInputElement
    fireEvent.change(input, { target: { value: '0' } })

    const form = input.closest('form')!
    expect(input.min).toBe('1')
    expect(input.checkValidity()).toBe(false)
    expect(form.checkValidity()).toBe(false)
    form.requestSubmit()
    await new Promise((r) => setTimeout(r, 0))
    expect(patches).toHaveLength(0)
    expect(screen.queryByText('Saved.')).toBeNull()
  })

  it('CAP-027 · Night limits must be at least 1 on the form (1 saves and shows "Saved.")', async () => {
    const { patches } = setup()
    const input = (await screen.findByLabelText(MAX_STAY)) as HTMLInputElement
    fireEvent.change(input, { target: { value: '1' } })

    const form = input.closest('form')!
    expect(form.checkValidity()).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Saved.')).toBeTruthy()
    expect(patches).toEqual([
      { bookingHorizonDate: '2030-12-31', maxConsecutiveNights: 1, maxNightsPerUserPerYear: 60 },
    ])
  })

  it('CAP-027 · The rules fail to load', async () => {
    installFetch({ 'GET /reservations/api/booking-rules': () => ({ status: 500 }) })
    renderWithQuery(<BookingRulesClient />)
    expect(await screen.findByText('Failed to load booking rules.')).toBeTruthy()
  })
})
