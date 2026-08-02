// Pinpointing where two email addresses differ.
//
// The keep-or-adopt prompt shows a shareholder's address next to a login's, and
// the pair that most needs the prompt is the pair that differs by a character or
// two — "melanmiller20@gmail.com" vs "melanimiller20@gmail.com". Rendered as
// plain text those read as identical, so an admin sees a warning that looks
// wrong and distrusts it. Splitting off the shared prefix and suffix lets the UI
// highlight only the part that actually differs.

export interface EmailDiff {
  /** Leading characters both share. */
  prefix: string
  /** The part unique to this address — may be empty when one is a subset. */
  middle: string
  /** Trailing characters both share. */
  suffix: string
}

/**
 * Split each address into shared prefix / differing middle / shared suffix.
 *
 * Returns `null` when the two are equal (nothing to point at). Comparison is
 * case-insensitive, matching how the addresses are compared everywhere else,
 * but the returned slices preserve each input's own casing so the UI shows what
 * is really stored.
 */
export function diffEmails(a: string, b: string): { a: EmailDiff; b: EmailDiff } | null {
  const lowerA = a.toLowerCase()
  const lowerB = b.toLowerCase()
  if (lowerA === lowerB) return null

  let start = 0
  const max = Math.min(lowerA.length, lowerB.length)
  while (start < max && lowerA[start] === lowerB[start]) start++

  // Walk back from both ends, but never past the prefix already claimed —
  // otherwise "aa" vs "aaa" would double-count the shared characters.
  let end = 0
  while (end < max - start && lowerA[lowerA.length - 1 - end] === lowerB[lowerB.length - 1 - end]) {
    end++
  }

  const slice = (value: string): EmailDiff => ({
    prefix: value.slice(0, start),
    middle: value.slice(start, value.length - end),
    suffix: value.slice(value.length - end),
  })

  return { a: slice(a), b: slice(b) }
}
