import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PortalHeader } from './PortalHeader'
import { HOME_URL } from './portalUrls'

describe('PortalHeader', () => {
  it('links the wordmark to the portal home by default', () => {
    const html = renderToStaticMarkup(<PortalHeader />)

    expect(html).toContain(`href="${HOME_URL}"`)
    expect(html).toContain('Miller Family Reunions')
    expect(html).toContain('MFR') // mobile wordmark
  })

  it('honors a homeHref override', () => {
    const html = renderToStaticMarkup(<PortalHeader homeHref="http://localhost:3002" />)

    expect(html).toContain('href="http://localhost:3002"')
  })

  it('shows the app badge linking to the app root when appName is given', () => {
    const html = renderToStaticMarkup(
      <PortalHeader appName="Reservations" appHref="/reservations" />,
    )

    expect(html).toContain('>Reservations</a>')
    expect(html).toContain('href="/reservations"')
  })

  it('falls back to "#" when appName is given without appHref', () => {
    const html = renderToStaticMarkup(<PortalHeader appName="Accounting" />)

    expect(html).toContain('href="#"')
  })

  it('omits the badge and right-side slot when not provided', () => {
    const html = renderToStaticMarkup(<PortalHeader />)

    expect(html).not.toContain('tag-accent-2')
  })

  it('renders children in the right-side slot', () => {
    const html = renderToStaticMarkup(
      <PortalHeader>
        <span>alice@example.com</span>
      </PortalHeader>,
    )

    expect(html).toContain('alice@example.com')
  })
})
