'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavLink {
  href: string
  label: string
}

const baseLinks: NavLink[] = [
  { href: '/reservations/calendar', label: 'Calendar' },
  { href: '/reservations/my-reservations', label: 'My Reservations' },
  { href: '/reservations/summary', label: 'Reservation Summary' },
  { href: '/reservations/activity', label: 'Activity' },
]

const adminLink: NavLink = { href: '/reservations/admin', label: 'Admin' }

export function NavBar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const links = isAdmin ? [...baseLinks, adminLink] : baseLinks

  return (
    <nav className="border-b border-sand-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-2 py-1.5 sm:px-3">
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={[
                'rounded px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                active ? 'bg-lake-100 text-lake-800' : 'text-stone-600 hover:bg-sand-100',
              ].join(' ')}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
