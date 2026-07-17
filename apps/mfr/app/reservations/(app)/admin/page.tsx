import { redirect } from 'next/navigation'

/**
 * The Admin landing simply forwards to the first section — the seg sub-nav in
 * the layout is the real navigation. The layout already gates this area to
 * reservations admins, so everyone here goes to the reservations list.
 */
export default async function AdminIndexPage() {
  redirect('/reservations/admin/reservations')
}
