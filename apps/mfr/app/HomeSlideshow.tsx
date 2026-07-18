'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

const INTERVAL_MS = 4800

/**
 * Auto-crossfading slideshow in a washed, slightly-rotated frame (ports the
 * prototype's hero slideshow). Sourced from a curated set of static images in
 * public/ — starting with the real family photo. With a single image it simply
 * shows it (no dots, no timer).
 */
export function HomeSlideshow({ images }: { images: string[] }) {
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    if (images.length < 2) return
    const iv = setInterval(() => setSlide((s) => (s + 1) % images.length), INTERVAL_MS)
    return () => clearInterval(iv)
  }, [images.length])

  return (
    <div className="relative flex justify-center">
      <div
        className="absolute z-0"
        style={{
          width: 340,
          height: 340,
          borderRadius: 999,
          background: 'var(--color-accent-2-200)',
          top: -20,
          right: -12,
        }}
        aria-hidden
      />
      <div
        className="absolute z-0"
        style={{
          width: 120,
          height: 120,
          borderRadius: 999,
          background: 'var(--color-accent-200)',
          bottom: 24,
          left: -8,
        }}
        aria-hidden
      />
      <figure
        className="relative z-[1] m-0 bg-white"
        style={{
          padding: '12px 12px 10px',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          transform: 'rotate(1.4deg)',
          width: 'min(470px, 92vw)',
        }}
      >
        <div
          className="washed relative w-full overflow-hidden"
          style={{
            aspectRatio: '4 / 3',
            borderRadius: 'calc(var(--radius-md) - 6px)',
            background: 'var(--color-neutral-200)',
          }}
        >
          {images.map((src, i) => (
            <div
              key={src}
              className="absolute inset-0"
              style={{ opacity: i === slide ? 1 : 0, transition: 'opacity 1s ease' }}
            >
              <Image
                src={src}
                alt="Miller family at the lake"
                fill
                sizes="470px"
                style={{ objectFit: 'cover' }}
                priority={i === 0}
              />
            </div>
          ))}
        </div>
        <figcaption
          className="flex items-center justify-between gap-2.5"
          style={{ padding: '11px 4px 2px' }}
        >
          <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
            From the family album
          </span>
          {images.length > 1 && (
            <span className="flex gap-1.5">
              {images.map((src, i) => (
                <button
                  key={src}
                  onClick={() => setSlide(i)}
                  aria-label={`Show slide ${i + 1}`}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    background: i === slide ? 'var(--color-accent)' : 'var(--color-neutral-300)',
                    transition: 'background .2s ease',
                  }}
                />
              ))}
            </span>
          )}
        </figcaption>
      </figure>
    </div>
  )
}
