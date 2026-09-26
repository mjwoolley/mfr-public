// @vitest-environment happy-dom
// Requirements coverage (CAP-017 Featured photos): the home-page slideshow
// crossfades through the featured photos about every 5 seconds, shows each
// whole (contain, never cropped), offers dots to jump, and with only the
// lake-house fallback shows no dots.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react'
import { HomeSlideshow } from './HomeSlideshow'

vi.mock('next/image', () => ({
  default: ({ src, alt, style }: { src: string; alt: string; style?: React.CSSProperties }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} style={style} />
  ),
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const IMAGES = ['https://blob/one.jpg', 'https://blob/two.jpg', 'https://blob/three.jpg']

/** The src of the slide currently faded in. */
function visible() {
  return [...document.querySelectorAll('img')]
    .filter((img) => (img.parentElement as HTMLElement).style.opacity === '1')
    .map((img) => img.getAttribute('src'))
}

describe('CAP-017 Featured photos — home slideshow', () => {
  it('CAP-017 · Signed-in members see featured photos rotate on the home page', () => {
    vi.useFakeTimers()
    render(<HomeSlideshow images={IMAGES} />)

    // All 3 are layered for a crossfade; the first is showing.
    expect(document.querySelectorAll('img')).toHaveLength(3)
    expect(visible()).toEqual([IMAGES[0]])
    const layer = document.querySelector('img')!.parentElement as HTMLElement
    expect(layer.style.transition).toContain('opacity')

    // A new one about every 5 seconds, wrapping round.
    act(() => vi.advanceTimersByTime(4000))
    expect(visible()).toEqual([IMAGES[0]])
    act(() => vi.advanceTimersByTime(1000))
    expect(visible()).toEqual([IMAGES[1]])
    act(() => vi.advanceTimersByTime(5000))
    expect(visible()).toEqual([IMAGES[2]])
    act(() => vi.advanceTimersByTime(5000))
    expect(visible()).toEqual([IMAGES[0]])

    // Each photo is shown whole, never cropped.
    for (const img of document.querySelectorAll('img')) {
      expect((img as HTMLElement).style.objectFit).toBe('contain')
    }

    // I can jump to any of them using the dots below.
    const dots = screen.getAllByRole('button', { name: /Show slide \d/ })
    expect(dots).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Show slide 3' }))
    expect(visible()).toEqual([IMAGES[2]])
  })

  it('CAP-017 · The home slideshow falls back to the lake-house picture — with no dots', () => {
    vi.useFakeTimers()
    render(<HomeSlideshow images={['/lake-house.jpg']} />)
    expect(visible()).toEqual(['/lake-house.jpg'])
    expect(screen.queryAllByRole('button', { name: /Show slide/ })).toHaveLength(0)
    act(() => vi.advanceTimersByTime(20000))
    expect(visible()).toEqual(['/lake-house.jpg'])
  })
})
