// Member photo gallery: the seeded photo (global-setup, owned by the member
// persona) shows on the Albums page, the By Uploader view exposes the
// contributor + metadata, the owner sees their lightbox controls, and the
// gallery is gated to signed-in members. Real upload/HEIC/R2 aren't exercisable
// in CI (no Blob token) — those are covered by integration tests + preview smoke.

import { test, expect } from '@playwright/test'
import { WEB_URL } from '../../playwright.config'
import { contextFor } from '../session'

const SEEDED_PHOTO = 'google-signup-existing-email' // the /public asset the seed points at

test.describe('member gallery', () => {
  test('a member sees the seeded photo on the Albums page', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/photos`)
    await expect(page.getByRole('heading', { name: 'Albums' })).toBeVisible()
    await expect(page.locator(`img[src*="${SEEDED_PHOTO}"]`).first()).toBeVisible()
    await context.close()
  })

  test('the By Uploader view shows the contributor metadata', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/photos`)
    await page.getByText('By Uploader').click()
    await expect(page.getByText('seed-gallery.jpg')).toBeVisible()
    await expect(page.getByText('1600×1200')).toBeVisible()
    await context.close()
  })

  test('the owner sees Feature/Delete/Close controls in the lightbox', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/photos`)
    await page.locator(`img[src*="${SEEDED_PHOTO}"]`).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: /Feature on home/i })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Delete' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible()
    await context.close()
  })

  test('the gallery is gated — signed-out visitors are redirected to sign-in', async ({
    browser,
  }) => {
    const context = await browser.newContext() // no session cookie
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/photos`)
    await expect(page).toHaveURL(`${WEB_URL}/sign-in`)
    await context.close()
  })
})
