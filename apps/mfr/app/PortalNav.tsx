'use client'

// The single primary nav for the whole app: Home, the Reservations and
// Accounting sections (now internal routes in this one app), the portal pages
// (Photos/Meals/Documents), the optional external Chat link, and the lock-marked
// admin tab for content admins. Each section renders its own second-level
// sub-tab row inside its layout.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ResponsiveNav } from '@mfr/ui'
import type { CSSProperties, ReactNode } from 'react'

interface PortalNavProps {
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

// A small padlock marking the admin tab as admins-only (mirrors the lock glyph
// on the accounting sub-nav). Replaces the former gear icon.
function LockIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

export function PortalNav({ chatUrl, isAdmin }: PortalNavProps) {
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
    <ResponsiveNav>
      {internal('/', 'Home')}
      {internal('/reservations', 'Reservations')}
      {internal('/accounting', 'Accounting')}
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
            <LockIcon />
            Admin
          </>,
        )}
    </ResponsiveNav>
  )
}
