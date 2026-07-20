// The shared NextAuth config factory every app calls with its own basePath
// and hooks: Google-only sign-in, database sessions via the Drizzle adapter
// on the shared identity DB, the cross-subdomain cookie setup, and the
// session callback that attaches id/status/portal-roles to every session.
// One identity DB + one AUTH_SECRET across apps = one portal-wide login.

import type { NextAuthConfig, Session } from 'next-auth'
import type { AdapterUser } from '@auth/core/adapters'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import type { IdentityDb } from './db'
import { users, accounts, sessions, verificationTokens } from './schema'
import { NO_ROLES, type RolesReader } from './roles'
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
  /**
   * Overrides the session cookie's name. Left unset in production so Auth.js
   * uses its default name. A second environment sharing a registrable domain
   * with production (e.g. staging under *.staging.millerfamilyreunions.org)
   * sets a distinct name so production's cookie — which rides along to every
   * subdomain — is never mistaken for a staging session, and vice versa.
   */
  sessionCookieName?: string
  pages?: NextAuthConfig['pages']
  /** Runs once, when the Auth.js adapter creates a brand-new identity row. */
  onUserCreated?: (user: { id: string; email: string }) => Promise<void> | void
  /**
   * Runs on every session read, after the shared fields are attached — lets
   * an app attach its own business-DB-derived fields (e.g. accounting's
   * shareholderId).
   */
  extendSession?: (session: Session, user: AdapterUser) => Promise<void> | void
  /**
   * Resolves the signed-in user's portal roles (from the portal DB's
   * `portal_user_roles`) so the shared session callback can attach them to
   * `session.user.roles`. Every app passes `createRolesReaderFromEnv()`; when
   * omitted (e.g. in unit tests) roles default to NO_ROLES.
   */
  getUserRoles?: RolesReader
}

export function createAuthConfig(opts: CreateAuthConfigOptions): NextAuthConfig {
  if (process.env.NODE_ENV === 'production' && !opts.cookieDomain) {
    // Host-only session cookies silently break cross-subdomain SSO — every
    // production app must set AUTH_COOKIE_DOMAIN (.millerfamilyreunions.org).
    console.warn(
      '[auth] cookieDomain is unset: the session cookie will be host-only and sign-in will NOT be shared across millerfamilyreunions.org subdomains.',
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
    ...(opts.cookieDomain || opts.sessionCookieName
      ? {
          cookies: {
            sessionToken: {
              ...(opts.sessionCookieName ? { name: opts.sessionCookieName } : {}),
              options: {
                ...(opts.cookieDomain ? { domain: opts.cookieDomain } : {}),
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
      // Keep sign-in returns on-origin, but also allow a `callbackUrl` that
      // points at another app on the same registrable domain (e.g. accounting
      // redirecting a signed-out user to the portal's sign-in and back). The
      // allowed domain is the shared cookie domain (`.millerfamilyreunions.org`
      // in prod); in local dev, same-hostname (localhost across ports) is
      // allowed too. Anything else falls back to the app's own origin.
      async redirect({ url, baseUrl }) {
        if (url.startsWith('/')) return `${baseUrl}${url}`
        try {
          const target = new URL(url)
          const base = new URL(baseUrl)
          if (target.origin === base.origin) return url
          if (target.hostname === base.hostname) return url
          if (opts.cookieDomain) {
            const dot = opts.cookieDomain.startsWith('.')
              ? opts.cookieDomain
              : `.${opts.cookieDomain}`
            const bare = dot.slice(1)
            if (target.hostname === bare || target.hostname.endsWith(dot)) return url
          }
        } catch {
          // fall through to baseUrl on any malformed URL
        }
        return baseUrl
      },
      async session({ session, user }) {
        session.user.id = user.id
        session.user.status = user.status
        session.user.roles = opts.getUserRoles ? await opts.getUserRoles(user.id) : NO_ROLES
        // Bootstrap owner: a designated email is always an approved site owner.
        // Owner/approval normally live in the DB (users.status,
        // portal_user_roles.is_site_owner), but a fresh or forked database — a
        // per-PR preview, a new environment — starts with the owner as a pending
        // user and no one able to approve them (only an owner can). Pinning one
        // email as owner in-session breaks that catch-22. Overridable via
        // SITE_OWNER_EMAIL; defaults to the known owner.
        const ownerEmail = (process.env.SITE_OWNER_EMAIL ?? 'mwoolley2@gmail.com').toLowerCase()
        if (user.email?.toLowerCase() === ownerEmail) {
          session.user.status = 'approved'
          session.user.roles = { ...session.user.roles, siteOwner: true }
        }
        await opts.extendSession?.(session, user)
        return session
      },
    },
    events: {
      async linkAccount({ user, account }) {
        if (account.provider === 'google' && user.id) {
          await opts.db
            .update(users)
            .set({ googleSub: account.providerAccountId })
            .where(eq(users.id, user.id))
        }
      },
      async createUser({ user }) {
        if (user.id && user.email) await opts.onUserCreated?.({ id: user.id, email: user.email })
      },
    },
  }
}
