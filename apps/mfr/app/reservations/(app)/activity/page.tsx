import { redirect } from 'next/navigation'

/**
 * The site-wide activity feed moved to the master Admin area (it always
 * covered the whole portal, not just reservations). Kept as a redirect so old
 * links and bookmarks survive; the admin layout gates the target.
 */
export default function ActivityPage() {
  redirect('/admin/activity')
}
