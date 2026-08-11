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
]

const adminLink: NavLink = { href: '/reservations/admin', label: 'Admin' }

const tabBase =
  'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 py-3.5 text-[15px] transition-colors'

// A small padlock marking the admins-only tab (mirrors the portal nav + the
// accounting sub-nav lock glyph).
function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-75"
      aria-label="Admins only"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

export function NavBar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const links = isAdmin ? [...baseLinks, adminLink] : baseLinks

  return (
    <ResponsiveNav alwaysHorizontal>
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
            {link.href === adminLink.href && <LockIcon />}
          </Link>
        )
      })}
    </ResponsiveNav>
  )
}
