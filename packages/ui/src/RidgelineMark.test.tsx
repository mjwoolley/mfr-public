import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RidgelineMark } from './RidgelineMark'

describe('RidgelineMark', () => {
  it('renders an svg hidden from assistive tech', () => {
    const html = renderToStaticMarkup(<RidgelineMark />)

    expect(html).toContain('<svg')
    expect(html).toContain('aria-hidden="true"')
  })

  it('draws the ridge, waterline, and faint reflection', () => {
    const html = renderToStaticMarkup(<RidgelineMark />)

    const paths = html.match(/<path/g) ?? []
    expect(paths.length).toBe(3)
    expect(html).toContain('opacity="0.45"')
  })

  it('passes className and style through to the svg', () => {
    const html = renderToStaticMarkup(
      <RidgelineMark className="h-8 w-8" style={{ color: 'tomato' }} />,
    )

    expect(html).toContain('class="h-8 w-8"')
    expect(html).toContain('color:tomato')
  })
})
