import type { Metadata } from 'next'
import { canApproveMembers } from '@mfr/auth'
import { requirePortalContentAdmin } from '@/lib/authz'
import { AdminSubNav } from './AdminSubNav'

export const metadata: Metadata = { title: 'Admin' }

// Gates the whole /admin area to portal content admins (site owner or manager)
// and renders the shared heading + seg sub-nav; each tab is its own page.
// The nested /admin/users page adds its own tighter check.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePortalContentAdmin()
  const showUsers = canApproveMembers(session.user.roles)

  return (
    <section
      className="mx-auto max-w-5xl px-7 pt-6 pb-2"
      style={{ animation: 'fadeup .4s ease both' }}
    >
      <div
        className="text-xs font-bold uppercase"
        style={{ letterSpacing: '.22em', color: 'var(--color-accent-700)' }}
      >
        Admin
      </div>
      <h1 className="mt-2.5" style={{ fontSize: 'clamp(34px,4.4vw,46px)', lineHeight: 1.05 }}>
        Site settings.
      </h1>
      <p
        className="mt-3 max-w-[620px]"
        style={{
          fontSize: 16,
          lineHeight: 1.65,
          color: 'color-mix(in srgb, var(--color-text) 78%, transparent)',
        }}
      >
        Manage the pieces family members see. Changes here update the Home, Meals, and Photos pages
        right away.
      </p>
      <div className="mt-6">
        <AdminSubNav showUsers={showUsers} />
      </div>
      {children}
    </section>
  )
}
