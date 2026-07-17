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

  it('honors NEXT_PUBLIC_* overrides (the staging deploy)', async () => {
    const mod = await importWithEnv({
      NEXT_PUBLIC_HOME_URL: 'https://staging.millerfamilyreunions.org',
      NEXT_PUBLIC_RESERVATIONS_URL:
        'https://reservations.staging.millerfamilyreunions.org/reservations',
      NEXT_PUBLIC_ACCOUNTING_URL: 'https://accounting.staging.millerfamilyreunions.org/accounting',
    })

    expect(mod.HOME_URL).toBe('https://staging.millerfamilyreunions.org')
    expect(mod.RESERVATIONS_URL).toBe(
      'https://reservations.staging.millerfamilyreunions.org/reservations',
    )
    expect(mod.ACCOUNTING_URL).toBe(
      'https://accounting.staging.millerfamilyreunions.org/accounting',
    )
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
