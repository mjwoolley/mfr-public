'use client'

import { useState, type ReactNode } from 'react'

export interface ResponsiveNavProps {
  /** The already-rendered tab links (each app supplies its own Link/anchor elements). */
  children: ReactNode
  /** Width of the nav shell — accounting uses `max-w-4xl`, everything else the default. */
  maxWidthClass?: string
}

/**
 * The tab-bar shell shared by every app's nav: a horizontal tab row on md+
 * screens, collapsing to a hamburger-toggled vertical menu on mobile. The
 * links themselves come in as `children` so each app keeps its own
 * `next/link` + `usePathname` active-tab logic (this package has no Next.js
 * dependency).
 */
export function ResponsiveNav({ children, maxWidthClass = 'max-w-5xl' }: ResponsiveNavProps) {
  const [open, setOpen] = useState(false)

  return (
    <nav style={{ borderBottom: '1px solid var(--color-divider)' }}>
      <div className={`mx-auto ${maxWidthClass} px-4 sm:px-7`}>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-2 py-3.5 text-[15px] font-semibold md:hidden"
          style={{ color: 'color-mix(in srgb, var(--color-text) 60%, transparent)' }}
          aria-expanded={open}
          aria-controls="portal-nav-links"
          onClick={() => setOpen((o) => !o)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden
          >
            {open ? (
              <>
                <path d="M5 5 L19 19" />
                <path d="M19 5 L5 19" />
              </>
            ) : (
              <>
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </>
            )}
          </svg>
          Menu
        </button>
        <div
          id="portal-nav-links"
          className={`${open ? 'flex' : 'hidden'} flex-col pb-3 md:flex md:flex-row md:items-center md:gap-5 md:overflow-x-auto md:pb-0`}
          onClick={(e) => {
            // Close the mobile menu after any link click — client-side
            // navigations don't remount this component.
            if ((e.target as HTMLElement).closest('a')) setOpen(false)
          }}
        >
          {children}
        </div>
      </div>
    </nav>
  )
}
