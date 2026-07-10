import Link from 'next/link'
import { auth } from '@/lib/auth/config'

interface AdminSection {
  href: string
  label: string
  description: string
  requires: 'reservationsAdmin' | 'portalAdmin'
}

const sections: AdminSection[] = [
  {
    href: '/reservations/admin/users',
    label: 'Manage Users',
    description: 'Approve pending signups, block users.',
    requires: 'portalAdmin',
  },
  {
    href: '/reservations/admin/reservations',
    label: 'All Reservations',
    description: 'View, edit, or cancel any reservation.',
    requires: 'reservationsAdmin',
  },
  {
    href: '/reservations/admin/blocked-dates',
    label: 'Blocked Dates',
    description: 'Block off dates the cabin is unavailable.',
    requires: 'reservationsAdmin',
  },
  {
    href: '/reservations/admin/booking-rules',
    label: 'Booking Rules',
    description: 'Set the booking horizon and per-user limits.',
    requires: 'reservationsAdmin',
  },
]

export default async function AdminIndexPage() {
  const session = await auth()
  const isReservationsAdmin = session?.user?.isReservationsAdmin ?? false
  const visibleSections = sections.filter((s) => s.requires === 'portalAdmin' || isReservationsAdmin)

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Admin</h1>
      <ul className="space-y-2">
        {visibleSections.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="block rounded border p-3 hover:bg-gray-50">
              <p className="font-medium text-blue-700">{s.label}</p>
              <p className="text-sm text-gray-500">{s.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
