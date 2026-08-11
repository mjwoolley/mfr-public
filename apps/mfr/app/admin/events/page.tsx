import type { Metadata } from 'next'
import { getEvents } from '@/lib/portal'
import { EventsEditor } from '../AdminPanels'

export const metadata: Metadata = { title: 'Events' }

export default async function EventsAdminPage() {
  const events = await getEvents()

  return (
    <EventsEditor
      events={events.map((e) => ({
        id: e.id,
        startDate: e.startDate,
        endDate: e.endDate,
        time: e.time,
        description: e.description,
        meetingLink: e.meetingLink,
      }))}
    />
  )
}
