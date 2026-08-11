import type { Metadata } from 'next'
import { getPortalSettings } from '@/lib/portal'
import { LinksForm } from '../AdminPanels'

export const metadata: Metadata = { title: 'Links' }

export default async function LinksAdminPage() {
  const settings = await getPortalSettings()

  return (
    <div className="max-w-[560px]">
      <LinksForm
        driveUrl={settings.driveUrl}
        venmoUrl={settings.venmoUrl}
        chatUrl={settings.chatUrl}
      />
    </div>
  )
}
