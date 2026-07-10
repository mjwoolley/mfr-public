import type { ReactNode } from 'react'
import { RidgelineMark } from './RidgelineMark'

const HOME_URL = 'https://millerfamilyreunions.org'

export interface PortalHeaderProps {
  /** Which app this header sits in (e.g. "Reservations"). Omit on the homepage. */
  appName?: string
  /** The app's own root path, used by the app-name badge. */
  appHref?: string
  /** App-specific right side: nav links, user email, sign-out form. */
  children?: ReactNode
}

/**
 * The one header every app shares — a dark lake bar with the ridgeline mark.
 * The wordmark always routes back to the portal homepage; that's the
 * "back to home" affordance across the whole portal.
 */
export function PortalHeader({ appName, appHref, children }: PortalHeaderProps) {
  return (
    <header className="bg-lake-950 text-sand-50">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <a
          href={HOME_URL}
          className="flex shrink-0 items-center gap-2.5 text-sand-50 transition-colors hover:text-lake-200"
        >
          <RidgelineMark className="h-6 w-6 text-lake-300" />
          <span className="font-display text-lg font-semibold tracking-tight">
            <span className="hidden sm:inline">Miller Family Reunions</span>
            <span className="sm:hidden">MFR</span>
          </span>
        </a>
        {appName && (
          <a
            href={appHref ?? '#'}
            className="rounded-full bg-lake-800 px-3 py-1 text-xs font-medium tracking-wide text-lake-100 uppercase transition-colors hover:bg-lake-700 hover:text-sand-50"
          >
            {appName}
          </a>
        )}
        {children && (
          <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">{children}</div>
        )}
      </div>
    </header>
  )
}
