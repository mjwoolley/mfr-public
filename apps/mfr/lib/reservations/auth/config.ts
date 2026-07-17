// This app's NextAuth instance from the shared @mfr/auth factory: portal
// roles attached to the session from the portal DB, plus a signup hook that
// records user_signed_up in the activity feed. No sign-in page here — the
// portal (apps/web) owns the canonical sign-in surface.

import NextAuth from 'next-auth'
import { createAuthConfig, createRolesReaderFromEnv } from '@mfr/auth'
import { identityDb } from './identityDb'
import { db } from '@/lib/db/client'
import { activityLog } from '@/lib/db/schema'

export const { handlers, auth, signIn, signOut } = NextAuth(
  createAuthConfig({
    db: identityDb,
    basePath: '/reservations/api/auth',
    cookieDomain: process.env.AUTH_COOKIE_DOMAIN,
    sessionCookieName: process.env.AUTH_SESSION_COOKIE_NAME,
    getUserRoles: createRolesReaderFromEnv(),
    onUserCreated: async ({ id }) => {
      await db.insert(activityLog).values({
        eventType: 'user_signed_up',
        actorUserId: id,
        metadata: {},
      })
    },
  }),
)
