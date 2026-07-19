// Photos section layout: mounts the secondary nav (Albums / Featured / History)
// on every /photos page, the same way Accounting and Reservations do. Each page
// still gates itself with requireApproved().

import type { ReactNode } from 'react'
import { PhotosNav } from './PhotosNav'

export default function PhotosLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PhotosNav />
      {children}
    </>
  )
}
