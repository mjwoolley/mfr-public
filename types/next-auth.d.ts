import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      status: 'pending' | 'approved' | 'blocked'
      isAdmin: boolean
    } & DefaultSession['user']
  }
}

// `AdapterUser` (the `user` param passed to the `session` callback under the
// 'database' session strategy) lives in `@auth/core/adapters` and is not
// re-exported through the `next-auth` module, so augmenting `Session` above
// does not extend it. Augment it directly so `user.status`/`user.isAdmin`
// type-check in `lib/auth/config.ts`.
declare module '@auth/core/adapters' {
  interface AdapterUser {
    status: 'pending' | 'approved' | 'blocked'
    isAdmin: boolean
  }
}
