import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// next/image needs the Next.js runtime image config; render a plain img.
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}))

import Home from './page'

describe('landing page', () => {
  const html = renderToStaticMarkup(<Home />)

  it('renders the hero headline and location', () => {
    expect(html).toContain('Lake Lure, North Carolina')
    expect(html).toContain('on the lake.')
  })

  it('links to the reservations portal', () => {
    expect(html).toContain('https://reservations.millerfamilyreunions.org/reservations')
    expect(html).toContain('Plan a stay')
    expect(html).toContain('Open Reservations')
  })

  it('links to the accounting portal', () => {
    expect(html).toContain('https://accounting.millerfamilyreunions.org/accounting')
    expect(html).toContain('Open the ledger')
    expect(html).toContain('Open Accounting')
  })
})
