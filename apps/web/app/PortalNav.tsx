'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'

interface PortalNavProps {
  reservationsUrl: string
  accountingUrl: string
  chatUrl: string
  isAdmin: boolean
}

// Shared tab-bar styling — mirrors reservations' NavBar.tsx and accounting's
// nav-tabs.tsx so the portal nav reads the same across all three apps.
const tabBase =
  'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 py-3.5 text-[15px] transition-colors'
const muted = 'color-mix(in srgb, var(--color-text) 60%, transparent)'
const inactiveStyle: CSSProperties = { color: muted, borderBottomColor: 'transparent' }
const activeStyle: CSSProperties = {
  color: 'var(--color-accent)',
  borderBottomColor: 'var(--color-accent)',
}

function ExtArrow() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 17 L17 7" />
      <path d="M8 7h9v9" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

export function PortalNav({ reservationsUrl, accountingUrl, chatUrl, isAdmin }: PortalNavProps) {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

  const internal = (href: string, label: ReactNode) => {
    const active = isActive(href)
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`${tabBase} ${active ? 'font-bold' : 'font-semibold'}`}
        style={active ? activeStyle : inactiveStyle}
      >
        {label}
      </Link>
    )
  }

  return (
    <nav style={{ borderBottom: '1px solid var(--color-divider)' }}>
      <div className="mx-auto flex max-w-5xl items-center gap-5 overflow-x-auto px-4 sm:px-7">
        {internal('/', 'Home')}
        <a href={reservationsUrl} className={`${tabBase} font-semibold`} style={inactiveStyle}>
          Reservations
        </a>
        <a href={accountingUrl} className={`${tabBase} font-semibold`} style={inactiveStyle}>
          Accounting
        </a>
        {internal('/photos', 'Photos')}
        {internal('/meals', 'Meals')}
        {internal('/documents', 'Documents')}
        <a
          href={chatUrl}
          target="_blank"
          rel="noopener"
          className={`${tabBase} font-semibold`}
          style={inactiveStyle}
        >
          Family Chat
          <ExtArrow />
        </a>
        {isAdmin &&
          internal(
            '/admin',
            <>
              <GearIcon />
              Admin
            </>,
          )}
      </div>
    </nav>
  )
}
