import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  // The portal-wide session-user fields, shared by every mfr app. Declared as a
  // named interface (not an inline object on Session.user) so a consuming app
  // can augment it with its own per-app fields — e.g. accounting adds
  // `shareholderId` — via `declare module 'next-auth' { interface AppSessionUser {…} }`.
  interface AppSessionUser {
    id: string
    status: 'pending' | 'approved' | 'blocked'
    isReservationsAdmin: boolean
    isAccountingAdmin: boolean
  }

  interface Session {
    user: AppSessionUser & DefaultSession['user']
  }
}

declare module '@auth/core/adapters' {
  interface AdapterUser {
    status: 'pending' | 'approved' | 'blocked'
    isReservationsAdmin: boolean
    isAccountingAdmin: boolean
  }
}
