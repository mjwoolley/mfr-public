/**
 * Fixed identities seeded by global-setup and referenced by tests.
 *
 * Session tokens are arbitrary fixed strings: a "signed-in user" under
 * Auth.js database sessions is exactly a `sessions` row plus a cookie
 * holding its token.
 */
export const SESSION_EXPIRES = new Date('2030-01-01T00:00:00Z')

export interface Persona {
  id: string
  email: string
  name: string
  status: 'pending' | 'approved' | 'blocked'
  isReservationsAdmin: boolean
  isAccountingAdmin: boolean
  sessionToken: string
}

export const personas = {
  /** Approved family member; linked to the seeded accounting Shareholder. */
  member: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'member@e2e.test',
    name: 'E2E Member',
    status: 'approved',
    isReservationsAdmin: false,
    isAccountingAdmin: false,
    sessionToken: 'e2e-session-member',
  },
  /** Approved admin of both portals. */
  admin: {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'admin@e2e.test',
    name: 'E2E Admin',
    status: 'approved',
    isReservationsAdmin: true,
    isAccountingAdmin: true,
    sessionToken: 'e2e-session-admin',
  },
  /** Signed up but not yet approved. */
  pending: {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'pending@e2e.test',
    name: 'E2E Pending',
    status: 'pending',
    isReservationsAdmin: false,
    isAccountingAdmin: false,
    sessionToken: 'e2e-session-pending',
  },
  /** Approved, but neither an admin nor a linked shareholder. */
  outsider: {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'outsider@e2e.test',
    name: 'E2E Outsider',
    status: 'approved',
    isReservationsAdmin: false,
    isAccountingAdmin: false,
    sessionToken: 'e2e-session-outsider',
  },
} satisfies Record<string, Persona>

export type PersonaName = keyof typeof personas

/** The accounting Shareholder row linked (by email) to the member persona. */
export const MEMBER_SHAREHOLDER_ID = 'e2e-shareholder-member'
