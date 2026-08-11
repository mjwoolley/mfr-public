import { redirect } from 'next/navigation'

/** The Admin landing forwards to the first sub-view; the seg sub-nav in the
 * layout is the real navigation. (Not /admin/users — that tab is gated by a
 * separate capability and may not be visible to every content admin.) */
export default function AdminIndexPage() {
  redirect('/admin/schedule')
}
