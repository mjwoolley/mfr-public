import NextAuth from 'next-auth'
import { eq } from 'drizzle-orm'
import { createAuthConfig, createRolesReaderFromEnv } from '@mfr/auth'
import { identityDb } from './identityDb'
import { db } from './db/client'
import { shareholder, activityLog } from './db/schema'

// The single NextAuth instance for the whole unified app, mounted at /api/auth.
// Google-only, database sessions on the identity tables, portal roles attached
// by the shared factory. One origin now, so the cookie is host-only
// (cookieDomain/sessionCookieName are deliberately NOT passed — the factory's
// cross-subdomain machinery stays dormant and the redirect callback stays
// same-origin).
//
// The two per-section session hooks that used to live in the separate
// reservations/accounting NextAuth instances are merged here:
//   - onUserCreated: records `user_signed_up` in the reservations activity feed.
//   - extendSession: attaches the linked accounting Shareholder id, linking by
//     email on the first sign-in of an approved user with a matching row.
export const { handlers, auth, signIn, signOut } = NextAuth(
  createAuthConfig({
    db: identityDb,
    basePath: '/api/auth',
    pages: { signIn: '/sign-in' },
    getUserRoles: createRolesReaderFromEnv(),
    onUserCreated: async ({ id }) => {
      await db.insert(activityLog).values({
        eventType: 'user_signed_up',
        actorUserId: id,
        metadata: {},
      })
    },
    extendSession: async (session, user) => {
      const email = user.email?.toLowerCase()
      let shareholderId: string | null = null

      if (email) {
        const row = await db.query.shareholder.findFirst({
          where: eq(shareholder.email, email),
        })
        if (row) {
          if (row.userId !== user.id) {
            try {
              await db
                .update(shareholder)
                .set({ userId: user.id })
                .where(eq(shareholder.id, row.id))
            } catch (err) {
              // An admin may have already linked a different shareholder to this
              // user.id (linkShareholderToUser). If so this write loses the
              // unique race — don't crash the session callback, just skip the
              // (re)link. Drizzle wraps the driver error, so the Postgres
              // unique_violation SQLSTATE can be on err.code OR err.cause.code.
              const code =
                (err as { code?: string })?.code ??
                (err as { cause?: { code?: string } })?.cause?.code
              if (code !== '23505') throw err
            }
          }
          shareholderId = row.id
        }
      }

      session.user.shareholderId = shareholderId
    },
  }),
)
