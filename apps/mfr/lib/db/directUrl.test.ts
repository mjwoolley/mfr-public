import { describe, expect, it } from 'vitest'
import { resolveDirectUrl } from './directUrl.mjs'

describe('resolveDirectUrl', () => {
  it('prefers DIRECT_URL when set', () => {
    expect(resolveDirectUrl({ DIRECT_URL: 'direct', DATABASE_URL_UNPOOLED: 'unpooled' })).toBe(
      'direct',
    )
  })

  it('falls back to DATABASE_URL_UNPOOLED when DIRECT_URL is unset (preview deploys)', () => {
    expect(resolveDirectUrl({ DATABASE_URL_UNPOOLED: 'unpooled' })).toBe('unpooled')
  })

  it('falls back when DIRECT_URL is empty', () => {
    expect(resolveDirectUrl({ DIRECT_URL: '', DATABASE_URL_UNPOOLED: 'unpooled' })).toBe('unpooled')
  })

  it('returns undefined when neither is set', () => {
    expect(resolveDirectUrl({})).toBeUndefined()
  })
})
