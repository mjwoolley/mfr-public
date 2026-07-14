import type { Browser, BrowserContext } from '@playwright/test'
import { personas, type PersonaName } from './personas'

/**
 * A browser context signed in as the given persona: the seeded session
 * token rides in the `authjs.session-token` cookie (the plain, non-__Secure-
 * name, because the apps are served over http on localhost). The cookie is
 * host-only on `localhost` and cookies are not port-scoped, so the same
 * context is signed in against all three apps.
 */
export async function contextFor(browser: Browser, persona: PersonaName): Promise<BrowserContext> {
  const context = await browser.newContext()
  await context.addCookies([
    {
      name: 'authjs.session-token',
      value: personas[persona].sessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  return context
}
