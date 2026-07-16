import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResponsiveNav } from './ResponsiveNav'

describe('ResponsiveNav', () => {
  it('renders its children inside the links container', () => {
    const html = renderToStaticMarkup(
      <ResponsiveNav>
        <a href="/one">One</a>
        <a href="/two">Two</a>
      </ResponsiveNav>,
    )

    expect(html).toContain('id="portal-nav-links"')
    expect(html).toContain('One')
    expect(html).toContain('Two')
  })

  it('starts closed: hamburger collapsed and panel hidden below md', () => {
    const html = renderToStaticMarkup(
      <ResponsiveNav>
        <a href="/one">One</a>
      </ResponsiveNav>,
    )

    expect(html).toMatch(/<button[^>]*aria-expanded="false"/)
    expect(html).toMatch(/<button[^>]*aria-controls="portal-nav-links"/)
    // The links container is display-hidden on mobile but a flex tab row on md+.
    expect(html).toMatch(/id="portal-nav-links"[^>]*class="[^"]*\bhidden\b[^"]*\bmd:flex\b/)
  })

  it('hides the hamburger on md+ screens', () => {
    const html = renderToStaticMarkup(
      <ResponsiveNav>
        <a href="/one">One</a>
      </ResponsiveNav>,
    )

    expect(html).toMatch(/<button[^>]*class="[^"]*md:hidden/)
  })

  it('defaults to max-w-5xl and honors maxWidthClass overrides', () => {
    const wide = renderToStaticMarkup(
      <ResponsiveNav>
        <a href="/one">One</a>
      </ResponsiveNav>,
    )
    const narrow = renderToStaticMarkup(
      <ResponsiveNav maxWidthClass="max-w-4xl">
        <a href="/one">One</a>
      </ResponsiveNav>,
    )

    expect(wide).toContain('max-w-5xl')
    expect(narrow).toContain('max-w-4xl')
    expect(narrow).not.toContain('max-w-5xl')
  })
})
