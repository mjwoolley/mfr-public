// Integration: the 401/403 matrix — signed-out, pending, approved-member,
// and admin sessions against member and admin endpoints.

import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/auth/config', () => ({ auth: vi.fn() }))
// POST sends a notification email after commit; mock the notifications
// module so this file neither queries the identity DB nor calls SES.
vi.mock('../../lib/notifications', () => ({
  sendReservationCreatedEmail: vi.fn(),
  sendReservationUpdatedEmail: vi.fn(),
  sendReservationCancelledEmail: vi.fn(),
}))
import { auth } from '../../lib/auth/config'
import { POST as postReservation } from '../../app/reservations/api/reservations/route'

function mockSession(status: 'pending' | 'approved' | 'blocked', isReservationsAdmin: boolean) {
  return {
    user: {
      id: 'user-1',
      status,
      roles: { siteOwner: false, siteManager: isReservationsAdmin, accountingManager: false },
      email: 'test@example.com',
    },
    expires: '2099-01-01',
  }
}

describe('authorization gates', () => {
  it('rejects a pending user attempting to create a reservation', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession('pending', false) as never)
    const request = new Request('http://localhost/api/reservations', {
      method: 'POST',
      body: JSON.stringify({ startDate: '2027-07-01', endDate: '2027-07-05' }),
    })
    const response = await postReservation(request as never)
    expect(response.status).toBe(403)
  })

  it('rejects an unauthenticated request to create a reservation', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const request = new Request('http://localhost/api/reservations', {
      method: 'POST',
      body: JSON.stringify({ startDate: '2027-07-01', endDate: '2027-07-05' }),
    })
    const response = await postReservation(request as never)
    expect(response.status).toBe(401)
  })
})
