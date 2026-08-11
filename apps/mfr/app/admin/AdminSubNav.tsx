'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Section {
  href: string
  label: string
}

/**
 * Seg-pill sub-nav across the portal Admin area (same pattern as the
 * accounting and reservations admin sub-navs). Users is conditional:
 * canApproveMembers gates that tab separately from the layout's
 * content-admin gate — the same roles today, but kept distinct.
 */
export function AdminSubNav({ showUsers }: { showUsers: boolean }) {
  const pathname = usePathname()

  const sections: Section[] = [
    { href: '/admin/schedule', label: 'Schedule' },
    { href: '/admin/links', label: 'Links' },
    { href: '/admin/events', label: 'Events' },
    ...(showUsers ? [{ href: '/admin/users', label: 'Users' }] : []),
    { href: '/admin/activity', label: 'Activity' },
  ]

  return (
    <div className="seg mb-6 flex-wrap" style={{ background: 'var(--color-surface)' }}>
      {sections.map((s) => {
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`)
        return (
          <Link
            key={s.href}
            href={s.href}
            className="seg-opt font-semibold no-underline"
            style={
              active
                ? { background: 'var(--color-accent)', color: 'var(--color-bg)' }
                : { color: 'var(--color-text)' }
            }
          >
            {s.label}
          </Link>
        )
      })}
    </div>
  )
}
