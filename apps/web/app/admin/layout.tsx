import { requirePortalContentAdmin } from '@/lib/authz'

// Gates the whole /admin area to portal content admins (site owner or manager).
// The nested /admin/users page adds its own tighter site-owner-only check.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePortalContentAdmin()
  return <>{children}</>
}
