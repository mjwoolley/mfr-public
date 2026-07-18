// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { AlbumCardRotator } from './AlbumCardRotator'

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

// next/image needs the Next runtime image config; render a plain img.
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}))

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

// The visible slide is the one whose wrapper div has opacity 1.
function visibleSrc(container: HTMLElement): string | null {
  const wrappers = Array.from(container.querySelectorAll('div'))
  const shown = wrappers.find((d) => d.style.opacity === '1')
  return shown?.querySelector('img')?.getAttribute('src') ?? null
}

describe('AlbumCardRotator', () => {
  it('advances to the next slide after the interval and wraps around', () => {
    const { container } = render(
      <AlbumCardRotator slides={['a.jpg', 'b.jpg', 'c.jpg']} index={0} />,
    )
    expect(visibleSrc(container)).toBe('a.jpg')

    // index 0 → no stagger; interval is 5000ms.
    tick(5000)
    expect(visibleSrc(container)).toBe('b.jpg')

    tick(5000)
    expect(visibleSrc(container)).toBe('c.jpg')

    // wraps back to the first
    tick(5000)
    expect(visibleSrc(container)).toBe('a.jpg')
  })

  it('does not rotate a single-slide card', () => {
    const { container } = render(<AlbumCardRotator slides={['only.jpg']} index={0} />)
    expect(visibleSrc(container)).toBe('only.jpg')
    tick(20000)
    expect(visibleSrc(container)).toBe('only.jpg')
  })
})
