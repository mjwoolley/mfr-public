/**
 * Fixed identities seeded by global-setup and referenced by tests.
 *
 * Session tokens are arbitrary fixed strings: a "signed-in user" under
 * Auth.js database sessions is exactly a `sessions` row plus a cookie
 * holding its token.
 */
export const SESSION_EXPIRES = new Date('2030-01-01T00:00:00Z')

export interface PersonaRoles {
  siteOwner: boolean
  siteManager: boolean
  accountingManager: boolean
}

export interface Persona {
  id: string
  email: string
  name: string
  status: 'pending' | 'approved' | 'blocked'
  /** Portal roles seeded into portal_user_roles; the source of authorization. */
  roles: PersonaRoles
  sessionToken: string
}

const NO_ROLES: PersonaRoles = { siteOwner: false, siteManager: false, accountingManager: false }

export const personas = {
  /** Approved family member; linked to the seeded accounting Shareholder. */
  member: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'member@e2e.test',
    name: 'E2E Member',
    status: 'approved',
    roles: NO_ROLES,
    sessionToken: 'e2e-session-member',
  },
  /** Approved admin of both portals: site manager (reservations) + accounting
   * manager. Not a site owner, so can approve/block members but not assign
   * roles. */
  admin: {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'admin@e2e.test',
    name: 'E2E Admin',
    status: 'approved',
    roles: { siteOwner: false, siteManager: true, accountingManager: true },
    sessionToken: 'e2e-session-admin',
  },
  /** Site owner — full power, including user management. */
  owner: {
    id: '55555555-5555-4555-8555-555555555555',
    email: 'owner@e2e.test',
    name: 'E2E Owner',
    status: 'approved',
    roles: { siteOwner: true, siteManager: false, accountingManager: false },
    sessionToken: 'e2e-session-owner',
  },
  /** Signed up but not yet approved. */
  pending: {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'pending@e2e.test',
    name: 'E2E Pending',
    status: 'pending',
    roles: NO_ROLES,
    sessionToken: 'e2e-session-pending',
  },
  /** Pending user whose approval the admin-edge spec drives (and then
   * blocks) — dedicated so the flow never disturbs the `pending` persona
   * that other specs assert stays pending. */
  applicant: {
    id: '77777777-7777-4777-8777-777777777777',
    email: 'applicant@e2e.test',
    name: 'E2E Applicant',
    status: 'pending',
    roles: NO_ROLES,
    sessionToken: 'e2e-session-applicant',
  },
  /** Approved member whose session the sign-out spec revokes — dedicated so
   * no other spec loses its login mid-suite. */
  visitor: {
    id: '88888888-8888-4888-8888-888888888888',
    email: 'visitor@e2e.test',
    name: 'E2E Visitor',
    status: 'approved',
    roles: NO_ROLES,
    sessionToken: 'e2e-session-visitor',
  },
  /** Blocked: can sign in, but every app locks them out. */
  blocked: {
    id: '66666666-6666-4666-8666-666666666666',
    email: 'blocked@e2e.test',
    name: 'E2E Blocked',
    status: 'blocked',
    roles: NO_ROLES,
    sessionToken: 'e2e-session-blocked',
  },
  /** Approved, but neither an admin nor a linked shareholder. */
  outsider: {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'outsider@e2e.test',
    name: 'E2E Outsider',
    status: 'approved',
    roles: NO_ROLES,
    sessionToken: 'e2e-session-outsider',
  },
  /**
   * Approved with no shareholder link, reserved for the link-by-name spec,
   * which links them to a household Shareholder mid-suite. Dedicated so it
   * never disturbs `outsider`, whose whole job is to stay unlinked. Their name
   * is contained in the household name the spec creates, which is what makes
   * them a suggested match; their email deliberately is not on it, so the link
   * only resolves through the by-userId fallback.
   */
  household: {
    id: '99999999-9999-4999-8999-999999999999',
    email: 'household@e2e.test',
    name: 'E2E Spouse',
    status: 'approved',
    roles: NO_ROLES,
    sessionToken: 'e2e-session-household',
  },
} satisfies Record<string, Persona>

export type PersonaName = keyof typeof personas

/** The accounting Shareholder row linked (by email) to the member persona. */
export const MEMBER_SHAREHOLDER_ID = 'e2e-shareholder-member'
