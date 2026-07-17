'use client'

// This app's tab row inside the shared ResponsiveNav: member pages plus the
// Admin tab when the session has the reservations-admin capability.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ResponsiveNav } from '@mfr/ui'

interface NavLink {
  href: string
  label: string
}

const baseLinks: NavLink[] = [
  { href: '/reservations/calendar', label: 'Calendar' },
  { href: '/reservations/my-reservations', label: 'My Reservations' },
  { href: '/reservations/summary', label: 'Reservations Summary' },
  { href: '/reservations/activity', label: 'Activity' },
]

const adminLink: NavLink = { href: '/reservations/admin', label: 'Admin' }

const tabBase = 'whitespace-nowrap border-b-2 py-3.5 text-[15px] transition-colors'

export function NavBar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const links = isAdmin ? [...baseLinks, adminLink] : baseLinks

  return (
    <ResponsiveNav>
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`${tabBase} ${active ? 'font-bold' : 'font-semibold'}`}
            style={
              active
                ? { color: 'var(--color-accent)', borderBottomColor: 'var(--color-accent)' }
                : {
                    color: 'color-mix(in srgb, var(--color-text) 60%, transparent)',
                    borderBottomColor: 'transparent',
                  }
            }
          >
            {link.label}
          </Link>
        )
      })}
    </ResponsiveNav>
  )
}
