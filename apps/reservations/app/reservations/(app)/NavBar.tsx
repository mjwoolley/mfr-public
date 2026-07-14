'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HOME_URL } from '@mfr/ui'

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
    <nav style={{ borderBottom: '1px solid var(--color-divider)' }}>
      <div className="mx-auto flex max-w-5xl items-center gap-6 overflow-x-auto px-4 sm:px-7">
        <a
          href={HOME_URL}
          className={`${tabBase} border-transparent font-semibold`}
          style={{ color: 'color-mix(in srgb, var(--color-text) 60%, transparent)' }}
        >
          Home
        </a>
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
      </div>
    </nav>
  )
}
