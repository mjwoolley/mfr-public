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
  { href: '/reservations/history', label: 'History' },
  { href: '/reservations/activity', label: 'Activity' },
]

const adminLink: NavLink = { href: '/reservations/admin', label: 'Admin' }

export function NavBar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const links = isAdmin ? [...baseLinks, adminLink] : baseLinks

  return (
    <nav className="border-b bg-white">
      <div className="mx-auto flex max-w-2xl items-center gap-1 overflow-x-auto p-2">
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={[
                'rounded px-3 py-2 text-sm font-medium whitespace-nowrap',
                active ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100',
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
