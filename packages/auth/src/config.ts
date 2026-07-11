import type { NextAuthConfig, Session } from 'next-auth'
import type { AdapterUser } from '@auth/core/adapters'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import type { IdentityDb } from './db'
import { users, accounts, sessions, verificationTokens } from './schema'
import './types'

export interface CreateAuthConfigOptions {
  db: IdentityDb
  basePath: string
  /**
   * '.millerfamilyreunions.org' once the routing strategy makes both apps
   * reachable on a shared registrable domain; leave unset for local dev and
   * for any routing strategy that keeps both apps on the same
   * browser-visible origin (host-only cookies already share in that case).
   */
  cookieDomain?: string
  pages?: NextAuthConfig['pages']
  /** Runs once, when the Auth.js adapter creates a brand-new identity row. */
  onUserCreated?: (user: { id: string; email: string }) => Promise<void> | void
  /**
   * Runs on every session read, after the shared fields are attached — lets
   * an app attach its own business-DB-derived fields (e.g. accounting's
   * shareholderId).
   */
  extendSession?: (session: Session, user: AdapterUser) => Promise<void> | void
}

export function createAuthConfig(opts: CreateAuthConfigOptions): NextAuthConfig {
  if (process.env.NODE_ENV === 'production' && !opts.cookieDomain) {
    // Host-only session cookies silently break cross-subdomain SSO — every
    // production app must set AUTH_COOKIE_DOMAIN (.millerfamilyreunions.org).
    console.warn(
      '[auth] cookieDomain is unset: the session cookie will be host-only and sign-in will NOT be shared across millerfamilyreunions.org subdomains.'
    )
  }
  return {
    basePath: opts.basePath,
    // Omit the key entirely rather than `pages: opts.pages` when unset:
    // @auth/core's init defaults `pages` to `{}` via
    // `{ pages: {}, ...config }`, and an explicit `pages: undefined` own
    // property survives that spread, clobbering the default. That leaves
    // `options.pages` undefined, which crashes on `pages.newUser` for
    // every new user's first sign-in.
    ...(opts.pages ? { pages: opts.pages } : {}),
    adapter: DrizzleAdapter(opts.db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    providers: [
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
      }),
    ],
    session: { strategy: 'database' },
    ...(opts.cookieDomain
      ? {
          cookies: {
            sessionToken: {
              options: {
                domain: opts.cookieDomain,
                path: '/',
                sameSite: 'lax' as const,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
              },
            },
          },
        }
      : {}),
    callbacks: {
      async session({ session, user }) {
        session.user.id = user.id
        session.user.status = user.status
        session.user.isReservationsAdmin = user.isReservationsAdmin
        session.user.isAccountingAdmin = user.isAccountingAdmin
        await opts.extendSession?.(session, user)
        return session
      },
    },
    events: {
      async linkAccount({ user, account }) {
        if (account.provider === 'google' && user.id) {
          await opts.db.update(users).set({ googleSub: account.providerAccountId }).where(eq(users.id, user.id))
        }
      },
      async createUser({ user }) {
        if (user.id && user.email) await opts.onUserCreated?.({ id: user.id, email: user.email })
      },
    },
  }
}
