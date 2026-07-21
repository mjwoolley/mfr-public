import { afterEach, describe, expect, it, vi } from 'vitest'

// HOME_URL / RESERVATIONS_URL / ACCOUNTING_URL are module-load-time constants
// reading NEXT_PUBLIC_* env, so each case re-imports the module fresh.
async function importWithEnv(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, undefined as unknown as string)
    else vi.stubEnv(key, value)
  }
  return import('./portalUrls')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('portal URLs', () => {
  it('defaults to the production hosts when no env overrides are set', async () => {
    const mod = await importWithEnv({
      NEXT_PUBLIC_HOME_URL: undefined,
      NEXT_PUBLIC_RESERVATIONS_URL: undefined,
      NEXT_PUBLIC_ACCOUNTING_URL: undefined,
    })

    expect(mod.HOME_URL).toBe('https://millerfamilyreunions.org')
    expect(mod.RESERVATIONS_URL).toBe('https://reservations.millerfamilyreunions.org/reservations')
    expect(mod.ACCOUNTING_URL).toBe('https://accounting.millerfamilyreunions.org/accounting')
  })

  it('honors NEXT_PUBLIC_* overrides (a preview deploy)', async () => {
    const mod = await importWithEnv({
      NEXT_PUBLIC_HOME_URL: 'https://mfr-web-preview.vercel.app',
      NEXT_PUBLIC_RESERVATIONS_URL: 'https://mfr-web-preview.vercel.app/reservations',
      NEXT_PUBLIC_ACCOUNTING_URL: 'https://mfr-web-preview.vercel.app/accounting',
    })

    expect(mod.HOME_URL).toBe('https://mfr-web-preview.vercel.app')
    expect(mod.RESERVATIONS_URL).toBe('https://mfr-web-preview.vercel.app/reservations')
    expect(mod.ACCOUNTING_URL).toBe('https://mfr-web-preview.vercel.app/accounting')
  })
})

describe('portalSignInUrl', () => {
  it('points at the portal sign-in page with no callback', async () => {
    const mod = await importWithEnv({ NEXT_PUBLIC_HOME_URL: undefined })

    expect(mod.portalSignInUrl()).toBe('https://millerfamilyreunions.org/sign-in')
  })

  it('encodes the callbackUrl query param', async () => {
    const mod = await importWithEnv({ NEXT_PUBLIC_HOME_URL: undefined })

    expect(mod.portalSignInUrl('https://accounting.millerfamilyreunions.org/accounting')).toBe(
      'https://millerfamilyreunions.org/sign-in?callbackUrl=' +
        encodeURIComponent('https://accounting.millerfamilyreunions.org/accounting'),
    )
  })
})
