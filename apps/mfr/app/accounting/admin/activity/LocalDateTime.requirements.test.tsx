// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocalDateTime } from './LocalDateTime'

// Requirements coverage for CAP-043 "Entry times are shown in my own time zone".
// Node reads process.env.TZ on every Date operation, so switching it here puts
// the "device" in Eastern time.

const ORIGINAL_TZ = process.env.TZ

beforeAll(() => {
  process.env.TZ = 'America/New_York'
})
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ
})
afterEach(() => cleanup())

describe('CAP-043 · Entry times are shown in my own time zone', () => {
  it("CAP-043 · Entry times are shown in my own time zone — 11:30 pm Eastern shows that date and '11:30 PM'", () => {
    // 03:30 UTC on Sep 2 is 11:30 pm EDT on Sep 1.
    render(<LocalDateTime iso="2026-09-02T03:30:00.000Z" />)

    const time = screen.getByText(/11:30\sPM/)
    expect(time.tagName).toBe('TIME')
    expect(time.getAttribute('datetime')).toBe('2026-09-02T03:30:00.000Z')
    expect(time.textContent).toMatch(/^Sep 1, 2026,? 11:30\sPM$/)
  })

  it('CAP-043 · Entry times are shown in my own time zone — the server render carries the raw instant, not a server-zone time', () => {
    const html = renderToStaticMarkup(<LocalDateTime iso="2026-09-02T03:30:00.000Z" />)

    expect(html).toBe('<time dateTime="2026-09-02T03:30:00.000Z">2026-09-02T03:30:00.000Z</time>')
  })
})
