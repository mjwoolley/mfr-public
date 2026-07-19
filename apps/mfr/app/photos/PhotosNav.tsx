'use client'

// The Photos section's secondary nav (under the main "Photos" tab), matching the
// underline-tab style Accounting and Reservations use for their section navs.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ResponsiveNav } from '@mfr/ui'

const links = [
  { href: '/photos', label: 'Albums' },
  { href: '/photos/featured', label: 'Featured' },
  { href: '/photos/history', label: 'History' },
]

const tabBase = 'whitespace-nowrap border-b-2 py-3.5 text-[15px] transition-colors'

export function PhotosNav() {
  const pathname = usePathname()
  // Albums owns the section root exactly; Featured/History own their own paths.
  const isActive = (href: string) =>
    href === '/photos'
      ? pathname === '/photos'
      : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <ResponsiveNav alwaysHorizontal>
      {links.map((link) => {
        const active = isActive(link.href)
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
