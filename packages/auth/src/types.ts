import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      status: 'pending' | 'approved' | 'blocked'
      isReservationsAdmin: boolean
      isAccountingAdmin: boolean
    } & DefaultSession['user']
  }
}

declare module '@auth/core/adapters' {
  interface AdapterUser {
    status: 'pending' | 'approved' | 'blocked'
    isReservationsAdmin: boolean
    isAccountingAdmin: boolean
  }
}
