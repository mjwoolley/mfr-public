import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { render } from '@react-email/render'
import { ReservationConfirmation } from './ReservationConfirmation'
import { ReservationUpdated } from './ReservationUpdated'
import { ReservationCancelled } from './ReservationCancelled'

describe('reservation email templates', () => {
  it('ReservationConfirmation shows owner, dates, nights, calendar link', async () => {
    const html = await render(
      createElement(ReservationConfirmation, {
        ownerName: 'Dana Brown',
        startDate: 'Aug 1, 2026',
        endDate: 'Aug 5, 2026',
        nights: 4,
        calendarUrl: 'https://resv.example/calendar',
      })
    )
    expect(html).toContain('Dana Brown')
    expect(html).toContain('Aug 1, 2026')
    expect(html).toContain('Aug 5, 2026')
    expect(html).toContain('4')
    expect(html).toContain('https://resv.example/calendar')
  })

  it('ReservationUpdated shows previous and new dates, and changed-by when set', async () => {
    const html = await render(
      createElement(ReservationUpdated, {
        ownerName: 'Dana Brown',
        previousStartDate: 'Aug 1, 2026',
        previousEndDate: 'Aug 5, 2026',
        startDate: 'Aug 8, 2026',
        endDate: 'Aug 12, 2026',
        nights: 4,
        changedByName: 'Sam Admin',
        calendarUrl: 'https://resv.example/calendar',
      })
    )
    expect(html).toContain('Aug 1, 2026')
    expect(html).toContain('Aug 8, 2026')
    // react-email injects `<!-- -->` between text nodes, so assert the label
    // and the interpolated name separately rather than as one string.
    expect(html).toContain('Changed by')
    expect(html).toContain('Sam Admin')
  })

  it('ReservationUpdated omits the changed-by line when not provided', async () => {
    const html = await render(
      createElement(ReservationUpdated, {
        ownerName: 'Dana Brown',
        previousStartDate: 'Aug 1, 2026',
        previousEndDate: 'Aug 5, 2026',
        startDate: 'Aug 8, 2026',
        endDate: 'Aug 12, 2026',
        nights: 4,
        calendarUrl: 'https://resv.example/calendar',
      })
    )
    expect(html).not.toContain('Changed by')
  })

  it('ReservationCancelled shows dates and cancelled-by when set', async () => {
    const html = await render(
      createElement(ReservationCancelled, {
        ownerName: 'Dana Brown',
        startDate: 'Aug 1, 2026',
        endDate: 'Aug 5, 2026',
        cancelledByName: 'Sam Admin',
        calendarUrl: 'https://resv.example/calendar',
      })
    )
    expect(html).toContain('Aug 1, 2026')
    expect(html).toContain('Aug 5, 2026')
    expect(html).toContain('Cancelled by')
    expect(html).toContain('Sam Admin')
  })

  it('ReservationCancelled omits the cancelled-by line when not provided', async () => {
    const html = await render(
      createElement(ReservationCancelled, {
        ownerName: 'Dana Brown',
        startDate: 'Aug 1, 2026',
        endDate: 'Aug 5, 2026',
        calendarUrl: 'https://resv.example/calendar',
      })
    )
    expect(html).not.toContain('Cancelled by')
  })
})
