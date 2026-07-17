import NextAuth from 'next-auth'
import { createAuthConfig, createRolesReaderFromEnv } from '@mfr/auth'
import { identityDb } from './identityDb'

// apps/web is the portal: it owns the portal DB and is the one sign-in UI. It
// has no business-DB fields beyond roles to attach (no `extendSession`) and
// never sees a brand-new identity row first (no `onUserCreated`;
// reservations/accounting own that). Roles come from the shared config's
// `getUserRoles`.
export const { handlers, auth, signIn, signOut } = NextAuth(
  createAuthConfig({
    db: identityDb,
    basePath: '/api/auth',
    cookieDomain: process.env.AUTH_COOKIE_DOMAIN,
    sessionCookieName: process.env.AUTH_SESSION_COOKIE_NAME,
    pages: { signIn: '/sign-in' },
    getUserRoles: createRolesReaderFromEnv(),
  }),
)
