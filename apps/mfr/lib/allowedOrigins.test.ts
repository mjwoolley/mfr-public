import { describe, expect, it } from 'vitest'
import { parseAllowedOrigins } from './allowedOrigins'

describe('parseAllowedOrigins', () => {
  it('returns an empty list when the value is undefined', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([])
  })

  it('returns an empty list for a blank string', () => {
    expect(parseAllowedOrigins('   ')).toEqual([])
  })

  it('parses a single origin', () => {
    expect(parseAllowedOrigins('app.example.com')).toEqual(['app.example.com'])
  })

  it('splits a comma-separated list and trims whitespace', () => {
    expect(parseAllowedOrigins(' app.example.com , *.vercel.app ')).toEqual([
      'app.example.com',
      '*.vercel.app',
    ])
  })

  it('drops empty entries from stray or trailing commas', () => {
    expect(parseAllowedOrigins('a.com,,b.com,')).toEqual(['a.com', 'b.com'])
  })
})
