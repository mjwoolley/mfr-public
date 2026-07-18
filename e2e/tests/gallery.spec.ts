// Member photo gallery: the seeded photo (global-setup, owned by the member
// persona) renders on the year album and the by-person view, the owner sees
// their Feature/Delete controls, and the gallery is gated to signed-in members.
// Real upload/HEIC/R2 aren't exercisable in CI (no Blob token) — those are
// covered by integration tests + the staging smoke; this guards the UI wiring.

import { test, expect } from '@playwright/test'
import { WEB_URL } from '../../playwright.config'
import { contextFor } from '../session'

const SEEDED_PHOTO = 'google-signup-existing-email' // the /public asset the seed points at

test.describe('member gallery', () => {
  test('a member sees the seeded photo on the year album', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/photos/2026`)
    await expect(page.getByRole('heading', { name: '2026 photos' })).toBeVisible()
    await expect(page.locator(`img[src*="${SEEDED_PHOTO}"]`).first()).toBeVisible()
    await context.close()
  })

  test('the by-person view shows the contributor and metadata', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/photos/people`)
    await expect(page.getByRole('heading', { name: 'Photos by person.' })).toBeVisible()
    await expect(page.getByText('seed-gallery.jpg')).toBeVisible()
    await expect(page.getByText('1600×1200')).toBeVisible()
    await context.close()
  })

  test('the owner sees Feature/Delete controls on their own photo', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/photos/2026`)
    await page.locator(`img[src*="${SEEDED_PHOTO}"]`).first().click()
    await expect(page.getByRole('button', { name: /Feature on home/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Delete/i })).toBeVisible()
    await context.close()
  })

  test('the gallery is gated — signed-out visitors are redirected to sign-in', async ({
    browser,
  }) => {
    const context = await browser.newContext() // no session cookie
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/photos/2026`)
    await expect(page).toHaveURL(`${WEB_URL}/sign-in`)
    await context.close()
  })
})
