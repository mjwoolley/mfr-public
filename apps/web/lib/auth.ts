import NextAuth from 'next-auth'
import { createAuthConfig } from '@mfr/auth'
import { identityDb } from './identityDb'

// apps/web's own sign-in is just a way to show who's signed in on the
// landing page — it has no business-DB fields to attach (no
// `extendSession`) and never sees a brand-new identity row first
// (no `onUserCreated`; reservations/accounting own that).
export const { handlers, auth, signIn, signOut } = NextAuth(
  createAuthConfig({
    db: identityDb,
    basePath: '/api/auth',
    cookieDomain: process.env.AUTH_COOKIE_DOMAIN,
    sessionCookieName: process.env.AUTH_SESSION_COOKIE_NAME,
    pages: { signIn: '/sign-in' },
  }),
)
