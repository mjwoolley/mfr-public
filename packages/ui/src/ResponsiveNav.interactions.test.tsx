// @vitest-environment happy-dom
//
// Interaction behavior of the mobile menu — the toggle/close branches that
// static markup (ResponsiveNav.test.tsx) can't execute.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ResponsiveNav } from './ResponsiveNav'

afterEach(cleanup)

function renderNav() {
  return render(
    <ResponsiveNav>
      <a href="/one">One</a>
      <span>not a link</span>
    </ResponsiveNav>,
  )
}

describe('ResponsiveNav interactions', () => {
  it('toggles the menu open and closed from the hamburger button', () => {
    renderNav()
    const button = screen.getByRole('button', { name: /menu/i })
    const panel = document.getElementById('portal-nav-links')!

    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(panel.className).toContain('hidden')

    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(panel.className).toContain('flex')
    expect(panel.className).not.toContain('hidden')

    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(panel.className).toContain('hidden')
  })

  it('swaps the hamburger icon for an × while open', () => {
    renderNav()
    const button = screen.getByRole('button', { name: /menu/i })

    // closed: three hamburger bars
    expect(button.querySelectorAll('path').length).toBe(3)

    fireEvent.click(button)
    // open: two crossing strokes
    expect(button.querySelectorAll('path').length).toBe(2)
  })

  it('closes the menu when a link inside it is clicked', () => {
    renderNav()
    const button = screen.getByRole('button', { name: /menu/i })
    fireEvent.click(button)

    fireEvent.click(screen.getByText('One'))
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps the menu open when a non-link inside it is clicked', () => {
    renderNav()
    const button = screen.getByRole('button', { name: /menu/i })
    fireEvent.click(button)

    fireEvent.click(screen.getByText('not a link'))
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })

  it('alwaysHorizontal renders a hamburger-less strip with links always visible', () => {
    render(
      <ResponsiveNav alwaysHorizontal>
        <a href="/one">One</a>
        <a href="/two">Two</a>
      </ResponsiveNav>,
    )
    // No hamburger toggle, and no collapsible panel — the sub-nav is a plain
    // horizontal strip that never hides its tabs behind a second menu.
    expect(screen.queryByRole('button', { name: /menu/i })).toBeNull()
    expect(document.getElementById('portal-nav-links')).toBeNull()
    expect(screen.getByText('One')).toBeTruthy()
    expect(screen.getByText('Two')).toBeTruthy()
  })
})
