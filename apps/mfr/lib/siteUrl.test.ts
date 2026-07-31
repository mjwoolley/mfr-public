import { describe, expect, it, afterEach, vi } from 'vitest'
import { siteOrigin, siteUrl } from './siteUrl'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('siteOrigin', () => {
  it('falls back to localhost when APP_BASE_URL is unset', () => {
    vi.stubEnv('APP_BASE_URL', undefined)
    expect(siteOrigin()).toBe('http://localhost:3000')
  })

  it('falls back to localhost when APP_BASE_URL is empty', () => {
    vi.stubEnv('APP_BASE_URL', '')
    expect(siteOrigin()).toBe('http://localhost:3000')
  })

  it('strips trailing slashes', () => {
    vi.stubEnv('APP_BASE_URL', 'https://example.org///')
    expect(siteOrigin()).toBe('https://example.org')
  })
})

describe('siteUrl', () => {
  // Portal-level paths carry no section prefix — this is what lets a signup
  // notification link straight to /admin/users, which neither section-scoped
  // appUrl helper can express.
  it('builds a portal-level absolute URL', () => {
    vi.stubEnv('APP_BASE_URL', 'https://example.org')
    expect(siteUrl('/admin/users')).toBe('https://example.org/admin/users')
  })

  it('tolerates a path with no leading slash', () => {
    vi.stubEnv('APP_BASE_URL', 'https://example.org')
    expect(siteUrl('admin/users')).toBe('https://example.org/admin/users')
  })

  it('does not discard a path already on the base', () => {
    // The reason for the string join: new URL('/admin', base) would drop /portal.
    vi.stubEnv('APP_BASE_URL', 'https://example.org/portal')
    expect(siteUrl('/admin/users')).toBe('https://example.org/portal/admin/users')
  })
})
