import type { ReactNode } from 'react'
import { RidgelineMark } from './RidgelineMark'
import { HOME_URL } from './portalUrls'

export interface PortalHeaderProps {
  /** Which app this header sits in (e.g. "Reservations"). Omit on the homepage. */
  appName?: string
  /** The app's own root path, used by the app-name badge. */
  appHref?: string
  /**
   * Where the wordmark links. Defaults to the portal home URL (production, or
   * whatever NEXT_PUBLIC_HOME_URL points at); pass to override in tests or a
   * one-off host.
   */
  homeHref?: string
  /** App-specific right side: nav links, user email, sign-out form. */
  children?: ReactNode
}

/**
 * The one header every app shares — the Organic light header: ridgeline mark
 * in terracotta beside the Caprasimo wordmark on the cream ground. The
 * wordmark always routes back to the portal homepage; that's the
 * "back to home" affordance across the whole portal.
 */
export function PortalHeader({
  appName,
  appHref,
  homeHref = HOME_URL,
  children,
}: PortalHeaderProps) {
  return (
    <header>
      <nav className="nav mx-auto max-w-5xl flex-wrap gap-y-2 px-4 pt-5 pb-2.5 sm:px-7">
        <span className="mr-auto flex items-center gap-3">
          <a
            href={homeHref}
            className="flex shrink-0 items-center gap-3"
            style={{ color: 'inherit' }}
          >
            <RidgelineMark className="h-[30px] w-[30px]" style={{ color: 'var(--color-accent)' }} />
            <span className="nav-brand" style={{ marginRight: 0 }}>
              <span className="hidden sm:inline">Miller Family Reunions</span>
              <span className="sm:hidden">MFR</span>
            </span>
          </a>
          {appName && (
            <a href={appHref ?? '#'} className="tag tag-accent-2 self-center no-underline">
              {appName}
            </a>
          )}
        </span>
        {children && <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{children}</div>}
      </nav>
    </header>
  )
}
