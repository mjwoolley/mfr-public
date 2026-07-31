import { describe, expect, it } from 'vitest'
import { matchesShareholderName, nameTokens, normalizeName } from './nameMatch'

describe('normalizeName', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeName("  O'Brien-Smith  ")).toBe('obrien smith')
  })

  it('strips accents so Anderegg matches Andéregg', () => {
    expect(normalizeName('Andéregg')).toBe('anderegg')
  })
})

describe('nameTokens', () => {
  it('drops joining words that carry no identifying signal', () => {
    expect(nameTokens('John and Michele Anderegg')).toEqual(['john', 'michele', 'anderegg'])
  })

  it('drops single characters, so a middle initial never decides a match', () => {
    expect(nameTokens('Michele A Anderegg')).toEqual(['michele', 'anderegg'])
    // The known cost of that rule: an all-initials name keeps only its surname.
    expect(nameTokens('J R Miller')).toEqual(['miller'])
  })

  it('returns nothing for a missing name', () => {
    expect(nameTokens(null)).toEqual([])
    expect(nameTokens('')).toEqual([])
    expect(nameTokens('   ')).toEqual([])
  })
})

describe('matchesShareholderName', () => {
  it('matches a person against their household shareholder record', () => {
    // The motivating case: the Michele Anderegg login vs the household row.
    expect(matchesShareholderName('Michele Anderegg', 'John and Michele Anderegg')).toBe(true)
  })

  it('matches an exact name', () => {
    expect(matchesShareholderName('Ray Miller', 'Ray Miller')).toBe(true)
  })

  it('ignores case, punctuation and extra whitespace', () => {
    expect(matchesShareholderName('michele  anderegg', 'MICHELE ANDEREGG')).toBe(true)
    expect(matchesShareholderName('Mary-Jo Miller', 'Mary Jo Miller')).toBe(true)
  })

  it('ignores word order', () => {
    expect(matchesShareholderName('Anderegg Michele', 'John and Michele Anderegg')).toBe(true)
  })

  it('rejects an unrelated person', () => {
    expect(matchesShareholderName('Bob Smith', 'John and Michele Anderegg')).toBe(false)
  })

  it('rejects a partial match — a shared surname is not enough', () => {
    expect(matchesShareholderName('Susan Anderegg', 'John and Michele Anderegg')).toBe(false)
  })

  it('matches whole words only, so a name that is a prefix of another does not count', () => {
    // "Ann" is a substring of "Anderegg"; a substring rule would wrongly match.
    expect(matchesShareholderName('Ann Miller', 'Anderegg Miller')).toBe(false)
  })

  it('does not let a joining word carry a match on its own', () => {
    expect(matchesShareholderName('And', 'John and Michele Anderegg')).toBe(false)
  })

  it('is one-directional: the shareholder name may have extra words, the login may not', () => {
    expect(matchesShareholderName('John and Michele Anderegg', 'Michele Anderegg')).toBe(false)
  })

  it('treats a missing name on either side as no match, never a match', () => {
    expect(matchesShareholderName(null, 'Michele Anderegg')).toBe(false)
    expect(matchesShareholderName('', 'Michele Anderegg')).toBe(false)
    expect(matchesShareholderName('Michele Anderegg', null)).toBe(false)
    expect(matchesShareholderName('Michele Anderegg', '')).toBe(false)
    expect(matchesShareholderName(null, null)).toBe(false)
  })

  it('handles a single-word login name', () => {
    expect(matchesShareholderName('Anderegg', 'John and Michele Anderegg')).toBe(true)
    expect(matchesShareholderName('Smith', 'John and Michele Anderegg')).toBe(false)
  })
})
