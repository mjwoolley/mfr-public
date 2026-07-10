import { PortalHeader } from '@mfr/ui'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PortalHeader appName="Reservations" appHref="/reservations" />
      {children}
    </>
  )
}
