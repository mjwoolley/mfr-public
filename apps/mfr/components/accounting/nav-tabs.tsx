'use client'

// Dumb renderer for the tab row Nav assembles: active-tab highlight from the
// pathname, badge pills, and lock glyphs, inside the shared ResponsiveNav.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ResponsiveNav } from '@mfr/ui'

export interface NavTab {
  href: string
  label: string
  /** Pending-approval count rendered as a pill (Inbox). */
  badge?: number
  /** Shows a lock glyph — the tab is currently admins-only (Contributions). */
  lock?: boolean
}

const tabBase =
  'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 py-3.5 text-[15px] transition-colors'

export function NavTabs({ tabs }: { tabs: NavTab[] }) {
  const pathname = usePathname()

  return (
    <ResponsiveNav maxWidthClass="max-w-4xl" alwaysHorizontal>
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`${tabBase} ${active ? 'font-bold' : 'font-semibold'}`}
            style={
              active
                ? { color: 'var(--color-accent)', borderBottomColor: 'var(--color-accent)' }
                : {
                    color: 'color-mix(in srgb, var(--color-text) 60%, transparent)',
                    borderBottomColor: 'transparent',
                  }
            }
          >
            {tab.label}
            {tab.badge ? (
              <span
                className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] text-[11px] font-bold"
                style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
              >
                {tab.badge}
              </span>
            ) : null}
            {tab.lock && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-75"
                aria-label="Admins only"
              >
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            )}
          </Link>
        )
      })}
    </ResponsiveNav>
  )
}
