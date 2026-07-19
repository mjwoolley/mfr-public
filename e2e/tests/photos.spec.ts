// The seeded member photo (global-setup) gives the /photos year grid its 2026
// album cover; Admin is gated to content admins. (Hero featured-photo behaviour
// is covered by the home page unit tests.)

import { test, expect } from '@playwright/test'
import { WEB_URL } from '../../playwright.config'
import { contextFor } from '../session'

// global-setup seeds one 2026 photo pointing at this distinct /public asset, so
// its presence proves the real seeded cover rendered (not the static fallback).
const SEEDED_PHOTO = 'google-signup-existing-email'

test.describe('photos page', () => {
  test('a member sees the year album cover on /photos', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/photos`)
    await expect(page.getByRole('heading', { name: 'Albums' })).toBeVisible()
    await expect(page.locator(`img[src*="${SEEDED_PHOTO}"]`).first()).toBeVisible()
    await context.close()
  })
})

test.describe('admin access', () => {
  test('a content admin reaches the Admin settings', async ({ browser }) => {
    const context = await contextFor(browser, 'admin')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/admin`)
    await expect(page.getByRole('heading', { name: 'Site settings.' })).toBeVisible()
    await context.close()
  })

  test('a plain member is redirected away from Admin', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/admin`)
    // requirePortalContentAdmin bounces non-admins to the public home.
    await expect(page).toHaveURL(`${WEB_URL}/`)
    await expect(page.getByRole('heading', { name: 'Site settings.' })).toHaveCount(0)
    await context.close()
  })
})
