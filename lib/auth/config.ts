import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users, accounts, sessions, verificationTokens, activityLog } from '@/lib/db/schema'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: {
    strategy: 'database',
  },
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id
      session.user.status = user.status
      session.user.isAdmin = user.isAdmin
      return session
    },
  },
  events: {
    async linkAccount({ user, account }) {
      if (account.provider === 'google' && user.id) {
        await db
          .update(users)
          .set({ googleSub: account.providerAccountId })
          .where(eq(users.id, user.id))
      }
    },
    async createUser({ user }) {
      if (user.id) {
        await db.insert(activityLog).values({
          eventType: 'user_signed_up',
          actorUserId: user.id,
          metadata: {},
        })
      }
    },
  },
})
