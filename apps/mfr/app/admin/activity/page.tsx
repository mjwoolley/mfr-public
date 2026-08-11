import type { Metadata } from 'next'
import { ActivityClient } from './ActivityClient'

export const metadata: Metadata = { title: 'Activity' }

// Site-wide activity feed (moved here from Reservations — it always covered
// the whole portal, not just reservations). Accounting activity has its own
// tab under Accounting → Admin.
export default function ActivityAdminPage() {
  return (
    <div className="pb-8">
      <p className="text-muted mb-4 text-sm">
        Everything members have done across the site — sign-ups, reservations, blocked dates, and
        rule changes. Photo activity lives on Photos → History; accounting activity is under
        Accounting → Admin.
      </p>
      <ActivityClient />
    </div>
  )
}
