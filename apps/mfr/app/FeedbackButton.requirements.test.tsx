// @vitest-environment happy-dom
// Requirement coverage for CAP-048 Member Feedback
// (requirements/portal/member-feedback.md): the floating button and panel.
// Rendered for real; only fetch (the /api/feedback call) and the pathname are
// stubbed. Visibility by portal status is covered in layout.requirements.test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ usePathname: () => '/photos' }))

import { FEEDBACK_SENT, FeedbackButton } from './FeedbackButton'
import {
  EMPTY_FEEDBACK_ERROR,
  FEEDBACK_UNAVAILABLE,
  LONG_FEEDBACK_ERROR,
} from '@/lib/feedback/validation'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  // happy-dom's <dialog> lacks showModal/close in some versions.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const button = () => screen.getByRole('button', { name: 'Feedback' })
const box = () => screen.getByRole('textbox') as HTMLTextAreaElement
const tick = () => act(() => new Promise((r) => setTimeout(r, 0)))

async function openPanel() {
  fireEvent.click(button())
  await tick()
}

describe('CAP-048 Member Feedback · the panel', () => {
  it('CAP-048 · The button stays available without covering primary navigation', () => {
    render(<FeedbackButton />)
    expect(button().className).toContain('fixed')
    expect(button().className).toContain('right-4')
    expect(button().className).toContain('bottom-4')
    expect(button().textContent).toBe('Feedback')
  })

  it('CAP-048 · The button is compact on a phone', () => {
    render(<FeedbackButton />)
    expect(button().getAttribute('aria-label')).toBe('Feedback')
    expect(button().querySelector('svg')?.getAttribute('class')).toContain('sm:hidden')
    expect(button().querySelector('span')?.className).toContain('max-sm:hidden')
  })

  it('CAP-048 · The button stays out of the way of full-screen experiences', async () => {
    render(<FeedbackButton />)
    const viewer = document.createElement('div')
    viewer.setAttribute('role', 'dialog')
    viewer.setAttribute('aria-modal', 'true')
    await act(async () => {
      document.body.appendChild(viewer)
    })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Feedback' })).toBeNull())
    await act(async () => {
      viewer.remove()
    })
    await waitFor(() => expect(button()).toBeTruthy())
  })

  it('CAP-048 · Feedback opens over the current page', async () => {
    render(<FeedbackButton />)
    await openPanel()
    expect(document.querySelector('dialog[open]')).not.toBeNull()
    expect(document.activeElement).toBe(box())
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
    expect(document.querySelectorAll('input, select')).toHaveLength(0)
  })

  it('CAP-048 · The panel is accessible by keyboard', async () => {
    render(<FeedbackButton />)
    await openPanel()
    // Focus containment comes from the native modal <dialog> (showModal).
    expect(document.querySelector('dialog')?.className).toContain('dialog-host')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await tick()
    expect(document.querySelector('dialog')).toBeNull()
    expect(document.activeElement).toBe(button())

    await openPanel()
    fireEvent(document.querySelector('dialog')!, new Event('close'))
    await tick()
    expect(document.querySelector('dialog')).toBeNull()
    expect(document.activeElement).toBe(button())
  })

  it('CAP-048 · Closing and reopening retains an unsent draft on the current page', async () => {
    render(<FeedbackButton />)
    await openPanel()
    fireEvent.change(box(), { target: { value: 'Half-written thought' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await tick()
    await openPanel()
    expect(box().value).toBe('Half-written thought')
  })

  it.each([
    ['no text', '', EMPTY_FEEDBACK_ERROR],
    ['whitespace only', '   ', EMPTY_FEEDBACK_ERROR],
    ['more than 2,000 characters', 'x'.repeat(2001), LONG_FEEDBACK_ERROR],
  ])('CAP-048 · Invalid Feedback is not sent: %s', async (_c, value, error) => {
    render(<FeedbackButton />)
    await openPanel()
    fireEvent.change(box(), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(screen.getByRole('alert').textContent).toBe(error)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('CAP-048 · Valid Feedback creates one Jira issue: Send is disabled and repeat clicks are ignored', async () => {
    let resolve!: (r: Response) => void
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)))
    render(<FeedbackButton />)
    await openPanel()
    fireEvent.change(box(), { target: { value: '  The dock light is out.  ' } })
    const send = screen.getByRole('button', { name: 'Send' })
    fireEvent.click(send)
    fireEvent.click(send)
    fireEvent.submit(send.closest('form')!)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: 'Sending…' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      message: 'The dock light is out.',
      pagePath: '/photos',
    })
    await act(async () => resolve(new Response('{"ok":true}')))
  })

  it('CAP-048 · A successful submission confirms receipt without exposing Jira', async () => {
    render(<FeedbackButton />)
    await openPanel()
    fireEvent.change(box(), { target: { value: 'Thanks for the site' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(FEEDBACK_SENT))
    expect(document.querySelector('dialog')).toBeNull()
    expect(screen.getByRole('status').textContent).not.toMatch(/KAN-|jira/i)
    await openPanel()
    expect(box().value).toBe('')
  })

  it.each([
    [
      'a server error',
      () => fetchMock.mockResolvedValue(new Response('{"error":"x"}', { status: 502 })),
    ],
    ['a network failure', () => fetchMock.mockRejectedValue(new TypeError('offline'))],
  ])("CAP-048 · Jira failure preserves the member's message: %s", async (_c, arrange) => {
    arrange()
    render(<FeedbackButton />)
    await openPanel()
    fireEvent.change(box(), { target: { value: 'Keep me' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(FEEDBACK_UNAVAILABLE))
    expect(box().value).toBe('Keep me')
    expect(document.querySelector('dialog[open]')).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows the server validation message for a 400', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: LONG_FEEDBACK_ERROR }), { status: 400 }),
    )
    render(<FeedbackButton />)
    await openPanel()
    fireEvent.change(box(), { target: { value: 'ok' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(LONG_FEEDBACK_ERROR))
    fireEvent.change(box(), { target: { value: 'ok!' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
