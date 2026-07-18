'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

const INTERVAL_MS = 5000
const STAGGER_MS = 900

/**
 * Crossfading rotator for a single album card's cover. Cycles `slides` every
 * ~5s; the start is staggered by `index * STAGGER_MS` so a grid of cards
 * doesn't flip in unison. With a single slide it just shows it (no timer).
 */
export function AlbumCardRotator({ slides, index }: { slides: string[]; index: number }) {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (slides.length < 2) return
    let interval: ReturnType<typeof setInterval> | undefined
    const startDelay = setTimeout(
      () => {
        interval = setInterval(() => setCurrent((c) => (c + 1) % slides.length), INTERVAL_MS)
      },
      (index * STAGGER_MS) % INTERVAL_MS,
    )
    return () => {
      clearTimeout(startDelay)
      if (interval) clearInterval(interval)
    }
  }, [slides.length, index])

  return (
    <>
      {slides.map((src, i) => (
        <div
          key={src}
          className="absolute inset-0"
          style={{ opacity: i === current ? 1 : 0, transition: 'opacity 1s ease' }}
        >
          <Image src={src} alt="Album photo" fill sizes="300px" style={{ objectFit: 'cover' }} />
        </div>
      ))}
    </>
  )
}
