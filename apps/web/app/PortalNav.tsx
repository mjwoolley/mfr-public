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

const base: CSSProperties = {
  textDecoration: 'none',
  fontWeight: 600,
  color: 'var(--color-text)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
}
const active: CSSProperties = { color: 'var(--color-accent-700)', fontWeight: 700 }

function ExtArrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 L17 7" />
      <path d="M8 7h9v9" />
    </svg>
  )
}

export function PortalNav({ reservationsUrl, accountingUrl, chatUrl, isAdmin }: PortalNavProps) {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

  const internal = (href: string, label: ReactNode) => (
    <Link href={href} style={{ ...base, ...(isActive(href) ? active : {}) }}>
      {label}
    </Link>
  )

  return (
    <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px]">
      {internal('/', 'Home')}
      <a href={reservationsUrl} style={base}>
        Reservations
      </a>
      <a href={accountingUrl} style={base}>
        Accounting
      </a>
      {internal('/photos', 'Photos')}
      {internal('/meals', 'Meals')}
      {internal('/documents', 'Documents')}
      <a href={chatUrl} target="_blank" rel="noopener" style={base}>
        Family Chat
        <ExtArrow />
      </a>
      {isAdmin &&
        internal(
          '/admin',
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            Admin
          </>,
        )}
    </nav>
  )
}
