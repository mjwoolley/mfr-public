import type { Metadata } from 'next'
import { getPortalSettings } from '@/lib/portal'
import { ScheduleForm } from '../AdminPanels'

export const metadata: Metadata = { title: 'Schedule' }

export default async function ScheduleAdminPage() {
  const settings = await getPortalSettings()

  return (
    <div className="max-w-[560px]">
      <ScheduleForm
        reunionYear={settings.reunionYear}
        reunionStart={settings.reunionStart}
        reunionEnd={settings.reunionEnd}
      />
    </div>
  )
}
