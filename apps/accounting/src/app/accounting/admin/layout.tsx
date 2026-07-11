import { requireAdmin } from "@/lib/authz";

// The "Activity log" sub-nav link that used to live here pointed at
// admin/transactions, which has been promoted to the top-level
// /accounting/activity route (Phase 12) and no longer exists under admin/*.
// This layout's only remaining job is the requireAdmin() gate shared by the
// admin-only sub-routes still nested here (transactions/new/*,
// transactions/[id]/correct, shareholders/*).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin(); // server-side re-check; middleware is only a UX fast path
  return <div>{children}</div>;
}
