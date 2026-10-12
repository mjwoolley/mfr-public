// Shared harness for the reservations UI requirement tests (happy-dom):
// renders a component inside a fresh React Query client and answers the
// component's fetch() calls from a small in-memory route table, so each test
// controls exactly what the reservations API returns.

import type { ReactElement } from 'react'
import { vi } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type {
  ReservationRow,
  BlockedDateRow,
  BookingRulesRow,
} from '@/app/reservations/(app)/calendar/useCalendarData'

export interface FakeRequest {
  method: string
  path: string
  body: unknown
}

export interface FakeResponse {
  status?: number
  body?: unknown
}

/** Keyed by "METHOD /path" (no query string); ":id" matches one path segment. */
export type Routes = Record<string, (req: FakeRequest) => FakeResponse | Promise<FakeResponse>>

function matches(pattern: string, method: string, path: string) {
  const [pMethod, pPath] = pattern.split(' ')
  if (pMethod !== method) return false
  const re = new RegExp(`^${pPath.replace(/:[a-zA-Z]+/g, '[^/]+')}$`)
  return re.test(path)
}

export function installFetch(routes: Routes) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    const key = Object.keys(routes).find((k) => matches(k, method, url.pathname))
    if (!key) throw new Error(`Unexpected fetch: ${method} ${url.pathname}`)
    const res = await routes[key]({ method, path: url.pathname, body })
    const status = res.status ?? 200
    return new Response(JSON.stringify(res.body ?? {}), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) }
}

/** The CAP-021 Background rules: horizon 2030-12-31, 14 nights, 60 a year. */
export const backgroundRules: BookingRulesRow = {
  id: 1,
  bookingHorizonDate: '2030-12-31',
  maxConsecutiveNights: 14,
  maxNightsPerUserPerYear: 60,
}

export function stay(over: Partial<ReservationRow> & { id: string }): ReservationRow {
  return {
    userId: 'me',
    startDate: '2027-07-10',
    endDate: '2027-07-13',
    status: 'confirmed',
    userName: 'Me Member',
    ...over,
  }
}

/**
 * Calendar data routes (reservations window, blocked dates, rules) backed by
 * mutable state, so a test can change what the "server" returns between
 * fetches (e.g. another member books while the page is open).
 */
export function calendarData(state: {
  reservations: ReservationRow[]
  blockedDates?: BlockedDateRow[]
  bookingRules?: BookingRulesRow | null
}): Routes {
  return {
    'GET /reservations/api/reservations': () => ({
      body: { reservations: state.reservations },
    }),
    'GET /reservations/api/blocked-dates': () => ({
      body: { blockedDates: state.blockedDates ?? [] },
    }),
    'GET /reservations/api/booking-rules': () => ({
      body: {
        bookingRules: state.bookingRules === undefined ? backgroundRules : state.bookingRules,
      },
    }),
  }
}

/** Pin "today" (Date only — React Query and testing-library timers stay real). */
export function pinToday(isoDate: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${isoDate}T12:00:00Z`))
}
