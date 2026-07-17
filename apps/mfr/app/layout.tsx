import type { Metadata } from 'next'
import { Caprasimo, Figtree } from 'next/font/google'
import { PortalHeader, AuthStatus, HOME_URL, RESERVATIONS_URL, ACCOUNTING_URL } from '@mfr/ui'
import { canManagePortalContent, canManageUsers } from '@mfr/auth'
import { auth, signOut } from '@/lib/auth'
import { getPortalSettings } from '@/lib/portal'
import { PortalNav } from './PortalNav'
import './globals.css'

const caprasimo = Caprasimo({
  variable: '--font-caprasimo',
  weight: '400',
  subsets: ['latin'],
})

const figtree = Figtree({
  variable: '--font-figtree',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Miller Family Reunions',
  description: "The Miller family's lake house tools: reservations and accounting.",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth()
  const roles = session?.user?.roles
  const isAdmin = roles ? canManagePortalContent(roles) || canManageUsers(roles) : false
  // chatUrl drives the Family Chat nav link; settings self-seeds on first read.
  const settings = await getPortalSettings()

  return (
    <html lang="en" className={`${caprasimo.variable} ${figtree.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <PortalHeader homeHref="/">
          {session?.user ? (
            <AuthStatus
              email={session.user.email ?? ''}
              onSignOut={async () => {
                'use server'
                await signOut({ redirectTo: HOME_URL })
              }}
            />
          ) : (
            <a
              href="/sign-in"
              className="text-sm underline underline-offset-[3px]"
              style={{ color: 'var(--color-accent)' }}
            >
              Sign in
            </a>
          )}
        </PortalHeader>
        <PortalNav
          reservationsUrl={RESERVATIONS_URL}
          accountingUrl={ACCOUNTING_URL}
          chatUrl={settings.chatUrl || 'https://chat.google.com/'}
          isAdmin={isAdmin}
        />
        <main className="flex w-full flex-1 flex-col">{children}</main>
        <footer>
          <div
            className="mx-auto max-w-5xl px-4 pt-12 pb-10 text-center text-[13px]"
            style={{ color: 'var(--color-neutral-600)' }}
          >
            Lake Lure, North Carolina &middot; A Miller family corporation
          </div>
        </footer>
      </body>
    </html>
  )
}
