'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Section {
  href: string
  label: string
}

const reservationsSections: Section[] = [
  { href: '/reservations/admin/reservations', label: 'All Reservations' },
  { href: '/reservations/admin/blocked-dates', label: 'Blocked Dates' },
  { href: '/reservations/admin/booking-rules', label: 'Booking Rules' },
]

const usersSection: Section = { href: '/reservations/admin/users', label: 'Users' }

/**
 * The seg-pill sub-nav across the Admin area. The reservations-specific
 * sections only show for reservations admins; the Users approval queue shows
 * for any portal admin (matching the route-group gates underneath).
 */
export function AdminSubNav({ isReservationsAdmin }: { isReservationsAdmin: boolean }) {
  const pathname = usePathname()
  const sections = isReservationsAdmin ? [...reservationsSections, usersSection] : [usersSection]

  return (
    <div className="seg mb-6 flex-wrap" style={{ background: 'var(--color-surface)' }}>
      {sections.map((s) => {
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`)
        return (
          <Link
            key={s.href}
            href={s.href}
            className="seg-opt no-underline"
            style={
              active
                ? { background: 'var(--color-accent)', color: 'var(--color-bg)', fontWeight: 600 }
                : { color: 'var(--color-text)', fontWeight: 600 }
            }
          >
            {s.label}
          </Link>
        )
      })}
    </div>
  )
}
