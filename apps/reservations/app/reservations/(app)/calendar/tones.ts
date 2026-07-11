/**
 * The two reservation tones from the design's legend: your own stays render
 * in terracotta (accent), everyone else's in sage (accent-2). CSS variable
 * references so the values track organic.css.
 */
export interface ReservationTone {
  bar: string
  fill: string
  ink: string
  tagClass: string
  tagLabel: string
}

export function reservationTone(isOwn: boolean): ReservationTone {
  return isOwn
    ? {
        bar: 'var(--color-accent)',
        fill: 'var(--color-accent-200)',
        ink: 'var(--color-accent-800)',
        tagClass: 'tag tag-accent',
        tagLabel: 'Your stay',
      }
    : {
        bar: 'var(--color-accent-2)',
        fill: 'var(--color-accent-2-200)',
        ink: 'var(--color-accent-2-800)',
        tagClass: 'tag tag-accent-2',
        tagLabel: 'Family',
      }
}
