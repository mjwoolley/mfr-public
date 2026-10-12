// Requirement tests for CAP-029 Reservation emails: the real notification
// builders and react-email templates, rendered to plain text, with only the
// recipient lookups and the SES hand-off mocked (same seams as
// notifications.test.ts). Asserts the subjects and lines the member reads.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@react-email/render'

const whereMock = vi.fn()
vi.mock('@/lib/reservations/auth/identityDb', () => ({
  identityDb: { select: () => ({ from: () => ({ where: whereMock }) }) },
}))
const adminIdsMock = vi.fn<() => Promise<string[]>>()
vi.mock('@mfr/auth', async (importActual) => {
  const actual = await importActual<typeof import('@mfr/auth')>()
  return { ...actual, createReservationsAdminIdsReader: () => adminIdsMock }
})
vi.mock('@/lib/reservations/email', () => ({
  sendEmail: vi.fn(),
  appUrl: (p: string) => `https://test.example/reservations${p}`,
}))
vi.mock('@/lib/reservations/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

import { sendEmail } from '@/lib/reservations/email'
import {
  sendReservationCreatedEmail,
  sendReservationUpdatedEmail,
  sendReservationCancelledEmail,
} from './notifications'

const owner = { id: 'u-owner', email: 'owner@example.com', name: 'Olive Owner', status: 'approved' }
const ada = { id: 'u-ada', email: 'ada@example.com', name: 'Ada', status: 'approved' }

beforeEach(() => {
  vi.mocked(sendEmail).mockReset()
  whereMock.mockReset()
  whereMock.mockResolvedValue([owner, ada])
  adminIdsMock.mockReset()
  adminIdsMock.mockResolvedValue([ada.id])
})

async function sent() {
  expect(sendEmail).toHaveBeenCalledTimes(1)
  const call = vi.mocked(sendEmail).mock.calls[0][0]
  const text = (await render(call.react, { plainText: true })).replace(/\s+/g, ' ')
  const html = await render(call.react)
  return { call, text, html }
}

const stayJul10 = {
  reservationId: 'r1',
  ownerUserId: owner.id,
  startDate: '2027-07-10',
  endDate: '2027-07-13',
}

describe('CAP-029 Reservation emails', () => {
  it('CAP-029 · I get a confirmation when I book', async () => {
    await sendReservationCreatedEmail(stayJul10)
    const { call, text, html } = await sent()

    expect(call.subject).toBe('Reservation confirmed: Jul 10, 2027 – Jul 13, 2027')
    expect(text).toContain('Check-in: Sat, July 10, 2027')
    expect(text).toContain('Check-out: Tue, July 13, 2027')
    expect(text).toContain('Nights: 3')
    expect(html).toMatch(
      /<a[^>]*href="https:\/\/test\.example\/reservations\/"[^>]*>View the calendar<\/a>/,
    )
  })

  it('CAP-029 · I am told when my dates change', async () => {
    await sendReservationUpdatedEmail({
      ...stayJul10,
      actorUserId: owner.id,
      startDate: '2027-07-11',
      endDate: '2027-07-14',
      previousStartDate: '2027-07-10',
      previousEndDate: '2027-07-13',
    })
    const { call, text } = await sent()

    expect(call.subject).toBe('Reservation updated: now Jul 11, 2027 – Jul 14, 2027')
    expect(text).toContain('Previous dates: Sat, July 10, 2027 – Tue, July 13, 2027')
    expect(text).toContain('New check-in: Sun, July 11, 2027')
    expect(text).toContain('New check-out: Wed, July 14, 2027')
    expect(text).toContain('Nights: 3')
  })

  it('CAP-029 · I am told when my stay is cancelled', async () => {
    await sendReservationCancelledEmail({ ...stayJul10, actorUserId: owner.id })
    const { call, text } = await sent()

    expect(call.subject).toBe('Reservation cancelled: Jul 10, 2027 – Jul 13, 2027')
    expect(text).toContain(
      'Your reservation from Sat, July 10, 2027 to Tue, July 13, 2027 has been cancelled.',
    )
    expect(text).toContain('The dates are now open for others to book.')
  })

  it('CAP-029 · I am told when an admin changes my stay ("Changed by Ada.", reply goes to Ada)', async () => {
    await sendReservationUpdatedEmail({
      ...stayJul10,
      actorUserId: ada.id,
      startDate: '2027-07-11',
      endDate: '2027-07-14',
      previousStartDate: '2027-07-10',
      previousEndDate: '2027-07-13',
    })
    const { call, text } = await sent()
    expect(text).toContain('Changed by Ada.')
    expect(call.replyTo).toBe('ada@example.com')
  })

  it('CAP-029 · I am told when an admin cancels my stay ("Cancelled by Ada.", reply goes to Ada)', async () => {
    await sendReservationCancelledEmail({ ...stayJul10, actorUserId: ada.id })
    const { call, text } = await sent()
    expect(text).toContain('Cancelled by Ada.')
    expect(call.replyTo).toBe('ada@example.com')
  })

  it.each([
    [
      'updated',
      () =>
        sendReservationUpdatedEmail({
          ...stayJul10,
          actorUserId: owner.id,
          startDate: '2027-07-11',
          endDate: '2027-07-14',
          previousStartDate: '2027-07-10',
          previousEndDate: '2027-07-13',
        }),
    ],
    ['cancelled', () => sendReservationCancelledEmail({ ...stayJul10, actorUserId: owner.id })],
  ])('CAP-029 · Every reservation email explains who is copied (%s email)', async (_kind, send) => {
    await send()
    const { text } = await sent()
    expect(text).toContain(
      "Reservations admins are CC'd on this notification. If something looks wrong, just reply to this email.",
    )
  })

  it('CAP-029 · Every reservation email explains who is copied (confirmation email — says "this confirmation", see audit)', async () => {
    await sendReservationCreatedEmail(stayJul10)
    const { text } = await sent()
    // The spec's sentence reads "on this notification"; the confirmation
    // template says "on this confirmation". Assert the shared substance.
    expect(text).toContain("Reservations admins are CC'd on this confirmation.")
    expect(text).toContain('If something looks wrong, just reply to this email.')
  })
})
