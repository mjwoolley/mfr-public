// @vitest-environment happy-dom
// Requirements coverage (CAP-018 Photo history): history times are shown in
// the viewer's own time zone. The server render emits the raw ISO time; once
// in the browser, LocalTime formats it with the device's locale and zone.

import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { LocalTime } from './LocalTime'

const ISO = '2026-07-04T08:00:00.000Z' // 8:00 in the morning UTC
const originalTz = process.env.TZ

afterEach(() => {
  cleanup()
  process.env.TZ = originalTz
})

describe('CAP-018 Photo history — local times', () => {
  it('CAP-018 · Times are shown in my own time zone', () => {
    // A device set to US Eastern time (EDT in July, UTC−4).
    process.env.TZ = 'America/New_York'
    expect(new Date(ISO).getHours()).toBe(4) // the zone switch took effect

    const { container } = render(<LocalTime iso={ISO} />)
    const time = container.querySelector('time')!
    expect(time.getAttribute('dateTime')).toBe(ISO)
    expect(time.textContent).toBe(new Date(ISO).toLocaleString())
    // 4:00 in the morning (locale decides 12h/24h formatting).
    expect(time.textContent).toMatch(/\b0?4:00:00\b/)
    expect(time.textContent).not.toMatch(/\b0?8:00:00\b/)
  })

  it('CAP-018 · Times are shown in my own time zone — the server never formats in its own zone', () => {
    process.env.TZ = 'UTC'
    // Server markup carries only the raw instant; the browser localizes it.
    expect(renderToString(<LocalTime iso={ISO} />)).toContain(`>${ISO}</time>`)
  })
})
