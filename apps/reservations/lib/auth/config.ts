import NextAuth from 'next-auth'
import { createAuthConfig } from '@mfr/auth'
import { identityDb } from './identityDb'
import { db } from '@/lib/db/client'
import { activityLog } from '@/lib/db/schema'

export const { handlers, auth, signIn, signOut } = NextAuth(
  createAuthConfig({
    db: identityDb,
    basePath: '/reservations/api/auth',
    cookieDomain: process.env.AUTH_COOKIE_DOMAIN,
    sessionCookieName: process.env.AUTH_SESSION_COOKIE_NAME,
    onUserCreated: async ({ id }) => {
      await db.insert(activityLog).values({
        eventType: 'user_signed_up',
        actorUserId: id,
        metadata: {},
      })
    },
  }),
)
