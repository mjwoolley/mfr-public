// @vitest-environment happy-dom
// Requirements coverage (CAP-013 Photo albums): the Photos section's
// Albums / Featured / History nav, with the current page highlighted.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const { pathname } = vi.hoisted(() => ({ pathname: { current: '/photos' } }))
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }))

import { PhotosNav } from './PhotosNav'

afterEach(() => cleanup())

function current() {
  return screen
    .getAllByRole('link')
    .filter((a) => a.getAttribute('aria-current') === 'page')
    .map((a) => a.textContent)
}

describe('CAP-013 Photo albums — Photos section nav', () => {
  it.each([
    ['/photos', 'Albums'],
    ['/photos/featured', 'Featured'],
    ['/photos/history', 'History'],
  ])(
    'CAP-013 · The Photos section has Albums, Featured and History pages — on %s, "%s" is highlighted',
    (path, label) => {
      pathname.current = path
      render(<PhotosNav />)

      // I can move between the three pages…
      const hrefs = Object.fromEntries(
        ['Albums', 'Featured', 'History'].map((name) => [
          name,
          screen.getAllByRole('link', { name }).map((a) => a.getAttribute('href')),
        ]),
      )
      expect(hrefs.Albums).toContain('/photos')
      expect(hrefs.Featured).toContain('/photos/featured')
      expect(hrefs.History).toContain('/photos/history')

      // …and only the page I am on is highlighted.
      expect(new Set(current())).toEqual(new Set([label]))
    },
  )
})
