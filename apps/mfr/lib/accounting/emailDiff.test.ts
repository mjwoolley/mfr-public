import { describe, expect, it } from 'vitest'
import { diffEmails } from './emailDiff'

/** Reassembling the slices must give the original back — otherwise the UI
 *  would render a subtly different address than the one that's stored. */
function rejoin(d: { prefix: string; middle: string; suffix: string }) {
  return d.prefix + d.middle + d.suffix
}

describe('diffEmails', () => {
  // The case from production that prompted this: one missing character makes
  // two addresses look identical at a glance.
  it('isolates a single missing character', () => {
    const result = diffEmails('melanmiller20@gmail.com', 'melanimiller20@gmail.com')!

    expect(result.a).toEqual({ prefix: 'melan', middle: '', suffix: 'miller20@gmail.com' })
    expect(result.b).toEqual({ prefix: 'melan', middle: 'i', suffix: 'miller20@gmail.com' })
  })

  it('round-trips both inputs exactly', () => {
    const pairs: [string, string][] = [
      ['melanmiller20@gmail.com', 'melanimiller20@gmail.com'],
      ['john@example.com', 'michele@example.com'],
      ['a@b.co', 'z@y.io'],
      ['same-start@a.com', 'same-start@b.com'],
    ]
    for (const [a, b] of pairs) {
      const result = diffEmails(a, b)!
      expect(rejoin(result.a)).toBe(a)
      expect(rejoin(result.b)).toBe(b)
    }
  })

  it('returns null when the addresses are the same', () => {
    expect(diffEmails('a@b.com', 'a@b.com')).toBeNull()
  })

  it('ignores case when deciding they are the same', () => {
    expect(diffEmails('A@B.com', 'a@b.COM')).toBeNull()
  })

  it('preserves each address own casing in the slices', () => {
    const result = diffEmails('John@example.com', 'Michele@example.com')!

    expect(rejoin(result.a)).toBe('John@example.com')
    expect(rejoin(result.b)).toBe('Michele@example.com')
  })

  it('handles a wholly different local part', () => {
    const result = diffEmails('john@example.com', 'michele@example.com')!

    expect(result.a.suffix).toBe('@example.com')
    expect(result.b.suffix).toBe('@example.com')
    expect(result.a.middle).toBe('john')
    expect(result.b.middle).toBe('michele')
  })

  // Guard against the prefix and suffix scans overlapping and double-counting.
  it('does not double-count shared characters when one is a prefix of the other', () => {
    const result = diffEmails('aa@x.com', 'aaa@x.com')!

    expect(rejoin(result.a)).toBe('aa@x.com')
    expect(rejoin(result.b)).toBe('aaa@x.com')
    expect(result.b.middle).toBe('a')
  })

  it('handles addresses sharing nothing at all', () => {
    const result = diffEmails('abc', 'xyz')!

    expect(result.a).toEqual({ prefix: '', middle: 'abc', suffix: '' })
    expect(result.b).toEqual({ prefix: '', middle: 'xyz', suffix: '' })
  })
})
