// @vitest-environment happy-dom
// Requirements coverage for CAP-008 Site settings — the admin editor panels
// (requirements/portal/site-settings.md). The server actions are mocked; the
// panels and the real buildDays run for real. Server-side persistence and
// validation are covered in tests/integration/requirements-site-settings.test.ts.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

const actions = vi.hoisted(() => ({
  saveSchedule: vi.fn(),
  saveLinks: vi.fn(),
  addEvent: vi.fn(),
  updateEvent: vi.fn(),
  removeEvent: vi.fn(),
}))
vi.mock('./actions', () => actions)

import { ScheduleForm, LinksForm, EventsEditor } from './AdminPanels'

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true })
})
afterEach(() => cleanup())

function dateInput(label: RegExp) {
  return screen.getByLabelText(label) as HTMLInputElement
}

describe('CAP-008 · Setting the reunion dates previews the meal slots', () => {
  it('July 1 to July 5 shows "5 days · 10 meal slots" and a tag for each day', () => {
    render(<ScheduleForm reunionYear={2026} reunionStart={null} reunionEnd={null} />)
    fireEvent.change(dateInput(/First day/i), { target: { value: '2026-07-01' } })
    fireEvent.change(dateInput(/Last day/i), { target: { value: '2026-07-05' } })

    expect(screen.getByText('5 days · 10 meal slots')).toBeTruthy()
    for (const d of ['Jul 1', 'Jul 2', 'Jul 3', 'Jul 4', 'Jul 5']) {
      expect(screen.getByText(new RegExp(`^\\w{3} ${d}$`))).toBeTruthy()
    }
    expect(screen.queryByText(/Jul 6$/)).toBeNull()
  })
})

describe('CAP-008 · An incomplete or backwards date range builds no days', () => {
  it.each([
    ['last day before first day', '2026-07-05', '2026-07-01'],
    ['first day blank', '', '2026-07-05'],
    ['last day blank', '2026-07-01', ''],
  ])('%s → "Set a valid date range"', (_label, start, end) => {
    render(<ScheduleForm reunionYear={2026} reunionStart={start} reunionEnd={end} />)
    expect(screen.getByText('Set a valid date range')).toBeTruthy()
    expect(screen.queryByText(/meal slots/)).toBeNull()
  })
})

describe('CAP-008 · The reunion is capped at 21 days', () => {
  it('a 30-day range previews only 21 days', () => {
    render(<ScheduleForm reunionYear={2026} reunionStart="2026-07-01" reunionEnd="2026-07-30" />)
    expect(screen.getByText('21 days · 42 meal slots')).toBeTruthy()
  })
})

describe('CAP-008 · The reunion year must be between 2000 and 2100 (UI surfaces the refusal)', () => {
  it('shows the server’s refusal message next to "Save schedule"', async () => {
    actions.saveSchedule.mockResolvedValue({ error: 'Too big: expected number to be <=2100' })
    render(<ScheduleForm reunionYear={2101} reunionStart="2026-07-01" reunionEnd="2026-07-05" />)
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }))
    await waitFor(() => expect(screen.getByText(/2100/)).toBeTruthy())
    expect(actions.saveSchedule).toHaveBeenCalledWith({
      reunionYear: '2101',
      reunionStart: '2026-07-01',
      reunionEnd: '2026-07-05',
    })
  })
})

describe('CAP-008 · Saving family links', () => {
  it('"Save links" sends the Drive folder, Family Venmo and Family Chat values', async () => {
    render(<LinksForm driveUrl="" venmoUrl="" chatUrl="" />)
    fireEvent.change(screen.getByLabelText(/Drive documents folder/i), {
      target: { value: 'https://drive.google.com/drive/folders/FOLDER' },
    })
    fireEvent.change(screen.getByLabelText(/Family Venmo/i), {
      target: { value: 'https://venmo.com/u/Family' },
    })
    fireEvent.change(screen.getByLabelText(/Family Chat space/i), {
      target: { value: 'https://chat.google.com/room/X' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save links' }))
    await waitFor(() =>
      expect(actions.saveLinks).toHaveBeenCalledWith({
        driveUrl: 'https://drive.google.com/drive/folders/FOLDER',
        venmoUrl: 'https://venmo.com/u/Family',
        chatUrl: 'https://chat.google.com/room/X',
      }),
    )
  })
})

const blankEvent = {
  id: '11111111-1111-4111-8111-111111111111',
  startDate: null,
  endDate: null,
  time: '',
  description: '',
  meetingLink: null,
}

describe('CAP-008 · Adding and editing an event', () => {
  it('"Add an event" adds one', async () => {
    render(<EventsEditor events={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Add an event/ }))
    await waitFor(() => expect(actions.addEvent).toHaveBeenCalledTimes(1))
  })

  it('each field is saved as I move out of it', async () => {
    render(<EventsEditor events={[blankEvent]} />)

    fireEvent.change(dateInput(/Start date/i), { target: { value: '2026-07-04' } })
    fireEvent.blur(dateInput(/Start date/i))
    await waitFor(() => expect(actions.updateEvent).toHaveBeenCalledTimes(1))
    expect(actions.updateEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: blankEvent.id, startDate: '2026-07-04' }),
    )

    const desc = screen.getByLabelText(/Description/i)
    fireEvent.change(desc, { target: { value: 'Fireworks' } })
    fireEvent.blur(desc)
    await waitFor(() => expect(actions.updateEvent).toHaveBeenCalledTimes(2))
    expect(actions.updateEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ startDate: '2026-07-04', description: 'Fireworks' }),
    )

    const link = screen.getByLabelText(/Zoom \/ Teams link/i)
    fireEvent.change(link, { target: { value: 'https://zoom.us/j/1' } })
    fireEvent.blur(link)
    await waitFor(() => expect(actions.updateEvent).toHaveBeenCalledTimes(3))
    expect(actions.updateEvent).toHaveBeenLastCalledWith({
      id: blankEvent.id,
      startDate: '2026-07-04',
      endDate: '',
      time: '',
      description: 'Fireworks',
      meetingLink: 'https://zoom.us/j/1',
    })
  })
})

describe('CAP-008 · A multi-day event has no time', () => {
  it('setting an end date clears the time and makes it unavailable with "Single day only"', async () => {
    render(<EventsEditor events={[{ ...blankEvent, startDate: '2026-07-01', time: '7:00 PM' }]} />)
    const time = screen.getByLabelText(/^Time/i) as HTMLInputElement
    expect(time.value).toBe('7:00 PM')
    expect(time.disabled).toBe(false)

    fireEvent.change(dateInput(/End date/i), { target: { value: '2026-07-05' } })
    fireEvent.blur(dateInput(/End date/i))

    expect(time.value).toBe('')
    expect(time.disabled).toBe(true)
    expect(time.placeholder).toBe('Single day only')
    await waitFor(() =>
      expect(actions.updateEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({ endDate: '2026-07-05', time: '' }),
      ),
    )
  })
})

describe('CAP-008 · An event cannot end before it starts (UI shows the refusal)', () => {
  it('shows "End date must be on or after the start date."', async () => {
    actions.updateEvent.mockResolvedValue({ error: 'End date must be on or after the start date.' })
    render(<EventsEditor events={[{ ...blankEvent, startDate: '2026-07-05' }]} />)
    fireEvent.change(dateInput(/End date/i), { target: { value: '2026-07-01' } })
    fireEvent.blur(dateInput(/End date/i))
    await waitFor(() =>
      expect(screen.getByText('End date must be on or after the start date.')).toBeTruthy(),
    )
  })
})

describe('CAP-008 · Removing an event', () => {
  it('the remove button removes that event', async () => {
    render(<EventsEditor events={[blankEvent]} />)
    fireEvent.click(screen.getByTitle('Remove event'))
    await waitFor(() => expect(actions.removeEvent).toHaveBeenCalledWith({ id: blankEvent.id }))
  })
})
