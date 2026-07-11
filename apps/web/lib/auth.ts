import NextAuth from 'next-auth'
import { createAuthConfig } from '@mfr/auth'
import { identityDb } from './identityDb'

// apps/web never originates a sign-in — it only reads the shared session (to
// show who's signed in) and can clear it (sign out). No `extendSession` (no
// business-DB fields to attach here) and no `onUserCreated` (web never sees a
// brand-new identity row first; reservations/accounting own that).
export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth(
  createAuthConfig({
    db: identityDb,
    basePath: '/api/auth',
    cookieDomain: process.env.AUTH_COOKIE_DOMAIN,
  })
)
