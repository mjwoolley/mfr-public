import { afterEach, describe, expect, it } from 'vitest'
import { getVenmoConfig } from './venmo'

const originalUrl = process.env.NEXT_PUBLIC_VENMO_URL
const originalHandle = process.env.NEXT_PUBLIC_VENMO_HANDLE

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_VENMO_URL
  else process.env.NEXT_PUBLIC_VENMO_URL = originalUrl
  if (originalHandle === undefined) delete process.env.NEXT_PUBLIC_VENMO_HANDLE
  else process.env.NEXT_PUBLIC_VENMO_HANDLE = originalHandle
})

describe('getVenmoConfig', () => {
  it('returns null when the URL env is unset', () => {
    delete process.env.NEXT_PUBLIC_VENMO_URL
    delete process.env.NEXT_PUBLIC_VENMO_HANDLE
    expect(getVenmoConfig()).toBeNull()
  })

  it('uses the explicit handle when provided', () => {
    process.env.NEXT_PUBLIC_VENMO_URL = 'https://venmo.com/u/miller-family'
    process.env.NEXT_PUBLIC_VENMO_HANDLE = '@MillerFam'
    expect(getVenmoConfig()).toEqual({
      url: 'https://venmo.com/u/miller-family',
      handle: '@MillerFam',
    })
  })

  it("derives the handle from the URL's last path segment", () => {
    process.env.NEXT_PUBLIC_VENMO_URL = 'https://venmo.com/u/miller-family'
    delete process.env.NEXT_PUBLIC_VENMO_HANDLE
    expect(getVenmoConfig()).toEqual({
      url: 'https://venmo.com/u/miller-family',
      handle: '@miller-family',
    })
  })

  it('ignores trailing slashes when deriving the handle', () => {
    process.env.NEXT_PUBLIC_VENMO_URL = 'https://venmo.com/u/miller-family///'
    delete process.env.NEXT_PUBLIC_VENMO_HANDLE
    expect(getVenmoConfig()?.handle).toBe('@miller-family')
  })
})
