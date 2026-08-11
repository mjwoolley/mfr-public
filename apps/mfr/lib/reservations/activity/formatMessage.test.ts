import { describe, it, expect } from 'vitest'
import { formatActivityMessage, type ActivityEvent, type UserNameMap } from './formatMessage'

const users: UserNameMap = {
  'user-jane': 'Jane',
  'user-admin': 'Admin User',
}

function makeEvent(overrides: Partial<ActivityEvent>): ActivityEvent {
  return {
    id: 'evt-1',
    eventType: 'user_signed_up',
    actorUserId: 'user-jane',
    metadata: {},
    createdAt: '2027-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('formatActivityMessage', () => {
  it('formats user_signed_up', () => {
    expect(formatActivityMessage(makeEvent({ eventType: 'user_signed_up' }), users)).toBe(
      'Jane signed up.',
    )
  })

  it('formats user_auto_approved', () => {
    expect(formatActivityMessage(makeEvent({ eventType: 'user_auto_approved' }), users)).toBe(
      'Jane signed up and was approved automatically.',
    )
  })

  it('formats user_approved', () => {
    const event = makeEvent({
      eventType: 'user_approved',
      actorUserId: 'user-admin',
      metadata: { targetUserId: 'user-jane' },
    })
    expect(formatActivityMessage(event, users)).toBe('Admin User approved Jane.')
  })

  it('formats user_blocked', () => {
    const event = makeEvent({
      eventType: 'user_blocked',
      actorUserId: 'user-admin',
      metadata: { targetUserId: 'user-jane' },
    })
    expect(formatActivityMessage(event, users)).toBe('Admin User blocked Jane.')
  })

  it('formats reservation_created', () => {
    const event = makeEvent({
      eventType: 'reservation_created',
      metadata: { reservationId: 'r1', startDate: '2027-07-01', endDate: '2027-07-05' },
    })
    expect(formatActivityMessage(event, users)).toBe('Jane booked 2027-07-01 → 2027-07-05.')
  })

  it("formats reservation_edited on the actor's own reservation", () => {
    const event = makeEvent({
      eventType: 'reservation_edited',
      metadata: {
        reservationId: 'r1',
        userId: 'user-jane',
        previousStartDate: '2027-07-01',
        previousEndDate: '2027-07-05',
        startDate: '2027-07-02',
        endDate: '2027-07-06',
      },
    })
    expect(formatActivityMessage(event, users)).toBe(
      'Jane changed their reservation from 2027-07-01 → 2027-07-05 to 2027-07-02 → 2027-07-06.',
    )
  })

  it("formats reservation_edited when an admin edits someone else's reservation", () => {
    const event = makeEvent({
      eventType: 'reservation_edited',
      actorUserId: 'user-admin',
      metadata: {
        reservationId: 'r1',
        userId: 'user-jane',
        previousStartDate: '2027-07-01',
        previousEndDate: '2027-07-05',
        startDate: '2027-07-02',
        endDate: '2027-07-06',
      },
    })
    expect(formatActivityMessage(event, users)).toBe(
      "Admin User changed Jane's reservation from 2027-07-01 → 2027-07-05 to 2027-07-02 → 2027-07-06.",
    )
  })

  it("formats reservation_cancelled on the actor's own reservation", () => {
    const event = makeEvent({
      eventType: 'reservation_cancelled',
      metadata: {
        reservationId: 'r1',
        userId: 'user-jane',
        startDate: '2027-07-01',
        endDate: '2027-07-05',
      },
    })
    expect(formatActivityMessage(event, users)).toBe(
      'Jane cancelled their reservation for 2027-07-01 → 2027-07-05.',
    )
  })

  it("formats reservation_cancelled when an admin cancels someone else's reservation", () => {
    const event = makeEvent({
      eventType: 'reservation_cancelled',
      actorUserId: 'user-admin',
      metadata: {
        reservationId: 'r1',
        userId: 'user-jane',
        startDate: '2027-07-01',
        endDate: '2027-07-05',
      },
    })
    expect(formatActivityMessage(event, users)).toBe(
      "Admin User cancelled Jane's reservation for 2027-07-01 → 2027-07-05.",
    )
  })

  it('formats blocked_date_created with a reason', () => {
    const event = makeEvent({
      eventType: 'blocked_date_created',
      actorUserId: 'user-admin',
      metadata: {
        blockedDateId: 'b1',
        startDate: '2027-10-01',
        endDate: '2027-10-10',
        reason: 'maintenance',
      },
    })
    expect(formatActivityMessage(event, users)).toBe(
      'Admin User blocked off 2027-10-01 → 2027-10-10 (maintenance).',
    )
  })

  it('formats blocked_date_created without a reason', () => {
    const event = makeEvent({
      eventType: 'blocked_date_created',
      actorUserId: 'user-admin',
      metadata: {
        blockedDateId: 'b1',
        startDate: '2027-10-01',
        endDate: '2027-10-10',
        reason: null,
      },
    })
    expect(formatActivityMessage(event, users)).toBe(
      'Admin User blocked off 2027-10-01 → 2027-10-10.',
    )
  })

  it('formats blocked_date_removed', () => {
    const event = makeEvent({
      eventType: 'blocked_date_removed',
      actorUserId: 'user-admin',
      metadata: {
        blockedDateId: 'b1',
        startDate: '2027-10-01',
        endDate: '2027-10-10',
        reason: null,
      },
    })
    expect(formatActivityMessage(event, users)).toBe(
      'Admin User removed the blocked dates 2027-10-01 → 2027-10-10.',
    )
  })

  it('formats booking_rules_updated', () => {
    const event = makeEvent({
      eventType: 'booking_rules_updated',
      actorUserId: 'user-admin',
      metadata: {
        before: {
          bookingHorizonDate: '2027-12-31',
          maxConsecutiveNights: 7,
          maxNightsPerUserPerYear: 14,
        },
        after: {
          bookingHorizonDate: '2028-12-31',
          maxConsecutiveNights: 10,
          maxNightsPerUserPerYear: 14,
        },
      },
    })
    expect(formatActivityMessage(event, users)).toBe(
      'Admin User updated the booking rules (horizon: 2028-12-31, max consecutive nights: 10, max nights/year: 14).',
    )
  })

  it('falls back to a generic message for an unrecognized event type', () => {
    const event = makeEvent({ eventType: 'something_new', metadata: {} })
    expect(formatActivityMessage(event, users)).toBe('Jane performed an action (something_new).')
  })

  it('falls back to "Someone" for a null actor', () => {
    const event = makeEvent({ eventType: 'user_signed_up', actorUserId: null })
    expect(formatActivityMessage(event, users)).toBe('Someone signed up.')
  })

  it('falls back to "A former member" for an actor id not present in the user map', () => {
    const event = makeEvent({ eventType: 'user_signed_up', actorUserId: 'user-deleted' })
    expect(formatActivityMessage(event, users)).toBe('A former member signed up.')
  })
})
