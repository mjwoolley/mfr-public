/**
 * Colorblind-aware palette for coloring a reservation by who booked it.
 * Each user id hashes to a fixed entry, so a person's stays always look
 * the same regardless of month or session.
 */
const PALETTE = [
  { bg: 'bg-sky-200', text: 'text-sky-900' },
  { bg: 'bg-amber-200', text: 'text-amber-900' },
  { bg: 'bg-violet-200', text: 'text-violet-900' },
  { bg: 'bg-pink-200', text: 'text-pink-900' },
  { bg: 'bg-emerald-200', text: 'text-emerald-900' },
  { bg: 'bg-orange-200', text: 'text-orange-900' },
  { bg: 'bg-cyan-200', text: 'text-cyan-900' },
  { bg: 'bg-fuchsia-200', text: 'text-fuchsia-900' },
] as const

export interface ReservationColor {
  bg: string
  text: string
}

// FNV-1a — a simple, deterministic string hash. Same input always
// produces the same output, which is all we need for a stable mapping.
function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function colorForUser(userId: string): ReservationColor {
  return PALETTE[hashString(userId) % PALETTE.length]
}
