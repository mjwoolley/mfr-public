import { describe, it, expect, vi, beforeEach } from 'vitest'

// identityDb is a module-load-time singleton hitting the real identity DB;
// replace the whole query chain so each test controls the returned rows.
const whereMock = vi.fn()
vi.mock('@/lib/auth/identityDb', () => ({
  identityDb: { select: () => ({ from: () => ({ where: whereMock }) }) },
}))
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(),
  appUrl: (p: string) => `https://test.example/reservations${p.startsWith('/') ? p : `/${p}`}`,
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

import { sendEmail } from '@/lib/email'
import { logger } from '@/lib/logger'
import {
  sendReservationCreatedEmail,
  sendReservationUpdatedEmail,
  sendReservationCancelledEmail,
} from './notifications'

const owner = { id: 'u-owner', email: 'owner@example.com', name: 'Olive Owner', isReservationsAdmin: false, status: 'approved' }
const admin1 = { id: 'u-admin1', email: 'admin1@example.com', name: 'Ada Admin', isReservationsAdmin: true, status: 'approved' }
const admin2 = { id: 'u-admin2', email: 'admin2@example.com', name: null, isReservationsAdmin: true, status: 'approved' }

const dates = { startDate: '2027-07-01', endDate: '2027-07-05' }

beforeEach(() => {
  vi.mocked(sendEmail).mockReset()
  vi.mocked(logger.error).mockReset()
  vi.mocked(logger.warn).mockReset()
  whereMock.mockReset()
  whereMock.mockResolvedValue([owner, admin1, admin2])
})

describe('sendReservationCreatedEmail', () => {
  it('emails the owner and CCs all admins, with nights and calendar link', async () => {
    await sendReservationCreatedEmail({ reservationId: 'r1', ownerUserId: owner.id, ...dates })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const call = vi.mocked(sendEmail).mock.calls[0][0]
    expect(call.to).toBe('owner@example.com')
    expect(call.cc).toEqual(['admin1@example.com', 'admin2@example.com'])
    expect(call.subject).toContain('Reservation confirmed')
    expect(call.subject).toContain('Jul 1, 2027')
    expect(call.replyTo).toBeUndefined()
    const props = (call.react as React.ReactElement<Record<string, unknown>>).props
    expect(props.ownerName).toBe('Olive Owner')
    expect(props.nights).toBe(4)
    expect(props.calendarUrl).toBe('https://test.example/reservations/')
  })

  it('does not CC the owner on their own email when the owner is an admin', async () => {
    const adminOwner = { ...owner, isReservationsAdmin: true }
    whereMock.mockResolvedValue([adminOwner, admin1])
    await sendReservationCreatedEmail({ reservationId: 'r1', ownerUserId: owner.id, ...dates })
    const call = vi.mocked(sendEmail).mock.calls[0][0]
    expect(call.to).toBe('owner@example.com')
    expect(call.cc).toEqual(['admin1@example.com'])
  })

  it('skips sending and logs when the owner user cannot be found', async () => {
    whereMock.mockResolvedValue([admin1])
    await sendReservationCreatedEmail({ reservationId: 'r1', ownerUserId: owner.id, ...dates })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })
})

describe('sendReservationUpdatedEmail', () => {
  const updateInput = {
    reservationId: 'r1',
    ownerUserId: owner.id,
    startDate: '2027-07-02',
    endDate: '2027-07-06',
    previousStartDate: '2027-07-01',
    previousEndDate: '2027-07-05',
  }

  it('names the acting admin and sets replyTo when an admin edits someone else’s reservation', async () => {
    await sendReservationUpdatedEmail({ ...updateInput, actorUserId: admin1.id })
    const call = vi.mocked(sendEmail).mock.calls[0][0]
    expect(call.to).toBe('owner@example.com')
    expect(call.subject).toContain('Reservation updated')
    expect(call.replyTo).toBe('admin1@example.com')
    const props = (call.react as React.ReactElement<Record<string, unknown>>).props
    expect(props.changedByName).toBe('Ada Admin')
    expect(props.previousStartDate).toBeTruthy()
  })

  it('omits changed-by and replyTo when the owner edits their own reservation', async () => {
    await sendReservationUpdatedEmail({ ...updateInput, actorUserId: owner.id })
    const call = vi.mocked(sendEmail).mock.calls[0][0]
    expect(call.replyTo).toBeUndefined()
    const props = (call.react as React.ReactElement<Record<string, unknown>>).props
    expect(props.changedByName).toBeUndefined()
  })
})

describe('sendReservationCancelledEmail', () => {
  it('emails the owner with cancelled-by when an admin cancels', async () => {
    await sendReservationCancelledEmail({ reservationId: 'r1', ownerUserId: owner.id, actorUserId: admin2.id, ...dates })
    const call = vi.mocked(sendEmail).mock.calls[0][0]
    expect(call.to).toBe('owner@example.com')
    expect(call.cc).toEqual(['admin1@example.com', 'admin2@example.com'])
    expect(call.subject).toContain('Reservation cancelled')
    expect(call.replyTo).toBe('admin2@example.com')
    const props = (call.react as React.ReactElement<Record<string, unknown>>).props
    // admin2 has no name — falls back to the email local part
    expect(props.cancelledByName).toBe('admin2')
  })

  it('never throws when the identity DB query fails', async () => {
    whereMock.mockRejectedValue(new Error('identity db down'))
    await expect(
      sendReservationCancelledEmail({ reservationId: 'r1', ownerUserId: owner.id, actorUserId: owner.id, ...dates })
    ).resolves.toBeUndefined()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
  })
})
