// The shared-identity story across the one unified app's sections: one
// session reaches the portal, reservations, and accounting; signing out
// anywhere kills it everywhere (a single revoked database session); and a
// blocked user is locked out of every section.

import { test, expect } from '@playwright/test'
import { WEB_URL, RESERVATIONS_URL, ACCOUNTING_URL } from '../../playwright.config'
import { contextFor } from '../session'

test.describe('cross-section shared identity', () => {
  test('one seeded session authenticates across every section', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()

    await page.goto(`${WEB_URL}/meals`)
    await expect(page).toHaveURL(/\/meals/) // not bounced to /sign-in

    await page.goto(`${RESERVATIONS_URL}/reservations/calendar`)
    await expect(page).toHaveURL(/\/reservations\/calendar/)
    await expect(page.getByText('member@e2e.test')).toBeVisible()

    await page.goto(`${ACCOUNTING_URL}/accounting/dashboard`)
    await expect(page.getByRole('heading', { name: 'E2E Member' })).toBeVisible()

    await context.close()
  })

  test('signing out of the portal signs out of every section (database session revoked)', async ({
    browser,
  }) => {
    // The dedicated visitor persona: signing THEM out never disturbs other
    // specs' sessions (each persona has its own session row).
    const context = await contextFor(browser, 'visitor')
    const page = await context.newPage()

    await page.goto(WEB_URL)
    await expect(page.getByText('visitor@e2e.test')).toBeVisible()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByText('visitor@e2e.test')).toHaveCount(0)

    // Database sessions: the sessions row is gone, so the other sections
    // reject the same cookie too.
    await page.goto(`${RESERVATIONS_URL}/reservations/calendar`)
    await expect(page).toHaveURL(new RegExp(`^${WEB_URL}/sign-in`))

    await page.goto(`${ACCOUNTING_URL}/accounting/dashboard`)
    await expect(page).toHaveURL(new RegExp(`^${WEB_URL}/sign-in`))

    await context.close()
  })

  test('a blocked user is locked out of every section', async ({ browser }) => {
    const context = await contextFor(browser, 'blocked')
    const page = await context.newPage()

    await page.goto(`${RESERVATIONS_URL}/reservations/calendar`)
    await expect(page).toHaveURL(/\/reservations\/blocked/)

    await page.goto(`${ACCOUNTING_URL}/accounting/dashboard`)
    await expect(page).toHaveURL(/\/accounting\/blocked/)

    // The portal bounces blocked users back to the public home.
    await page.goto(`${WEB_URL}/meals`)
    await expect(page).toHaveURL(new RegExp(`^${WEB_URL}/?$`))

    await context.close()
  })
})
