import NextAuth from 'next-auth'
import { eq } from 'drizzle-orm'
import { createAuthConfig, createRolesReader } from '@mfr/auth'
import { identityDb } from './identityDb'
import { db } from './db/client'
import { shareholder, activityLog } from './db/schema'
import { handleNewSignup } from './portal/signup'

// The single NextAuth instance for the whole unified app, mounted at /api/auth.
// Google-only, database sessions on the identity tables, portal roles attached
// by the shared factory. One origin now, so the cookie is host-only
// (cookieDomain/sessionCookieName are deliberately NOT passed — the factory's
// cross-subdomain machinery stays dormant and the redirect callback stays
// same-origin).
//
// The two per-section session hooks that used to live in the separate
// reservations/accounting NextAuth instances are merged here:
//   - onUserCreated: records `user_signed_up` in the activity feed, then either
//     links + auto-approves the new account (email matches a Shareholder) or
//     notifies the admins that someone is waiting.
//   - extendSession: attaches the linked accounting Shareholder id — by email,
//     falling back to a link an admin made by hand.
export const { handlers, auth, signIn, signOut } = NextAuth(
  createAuthConfig({
    db: identityDb,
    basePath: '/api/auth',
    // The sign-in page doubles as the error page: signIn-kind failures
    // (OAuthAccountNotLinked, OAuthCallbackError) already land on
    // /sign-in?error=CODE, and error-kind ones (AccessDenied, Verification,
    // Configuration) now do too instead of Auth.js's unstyled /api/auth/error.
    pages: { signIn: '/sign-in', error: '/sign-in' },
    getUserRoles: createRolesReader(process.env.DATABASE_URL!),
    onUserCreated: async ({ id, email, name }) => {
      await db.insert(activityLog).values({
        eventType: 'user_signed_up',
        actorUserId: id,
        metadata: {},
      })
      // Link + auto-approve when their email matches a Shareholder, otherwise
      // page the admins. Never throws — see lib/portal/signup.ts.
      await handleNewSignup({ id, email, name })
    },
    extendSession: async (session, user) => {
      const email = user.email?.toLowerCase()

      // Preferred link: a Shareholder whose email is the one they sign in with.
      const byEmail = email
        ? await db.query.shareholder.findFirst({ where: eq(shareholder.email, email) })
        : undefined

      if (!byEmail) {
        // No email match — honour an existing link made by hand. Shareholder
        // rows are often households ("John and Michele Anderegg") carrying one
        // spouse's email, so an admin links the other by name from Admin →
        // Shareholders. That write sets `userId`; without this lookup it was
        // never read back, and the member kept landing on /unauthorized however
        // many times they signed out and in again.
        const byUserId = await db.query.shareholder.findFirst({
          where: eq(shareholder.userId, user.id),
        })
        session.user.shareholderId = byUserId?.id ?? null
        return
      }

      if (byEmail.userId !== user.id) {
        try {
          await db
            .update(shareholder)
            .set({ userId: user.id })
            .where(eq(shareholder.id, byEmail.id))
        } catch (err) {
          // An admin may have already linked a different shareholder to this
          // user.id (linkShareholderToUser). If so this write loses the
          // unique race — don't crash the session callback, just skip the
          // (re)link. Drizzle wraps the driver error, so the Postgres
          // unique_violation SQLSTATE can be on err.code OR err.cause.code.
          const code =
            (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code
          if (code !== '23505') throw err
        }
      }

      session.user.shareholderId = byEmail.id
    },
  }),
)
