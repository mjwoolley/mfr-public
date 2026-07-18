// Photo-slide rotation: the seeded slides (global-setup) render on the home
// hero and the /photos album card, and only content admins reach the uploader.

import { test, expect } from '@playwright/test'
import { WEB_URL } from '../../playwright.config'
import { contextFor } from '../session'

// global-setup seeds highlights + 2026 slides pointing at this distinct asset,
// so its presence proves a real slide rendered (not the static fallback).
const SEEDED_SLIDE = 'google-signup-existing-email'

test.describe('photo rotation', () => {
  test('the home hero renders a highlight slide', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(WEB_URL)
    await expect(page.locator(`img[src*="${SEEDED_SLIDE}"]`).first()).toBeVisible()
    await context.close()
  })

  test('a member sees the seeded album card slide on /photos', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/photos`)
    await expect(page.getByRole('heading', { name: 'Photos, year by year.' })).toBeVisible()
    await expect(page.locator(`img[src*="${SEEDED_SLIDE}"]`).first()).toBeVisible()
    await context.close()
  })
})

test.describe('slides uploader access', () => {
  test('a content admin sees the Rotating photos uploader in Admin', async ({ browser }) => {
    const context = await contextFor(browser, 'admin')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/admin`)
    await expect(page.getByRole('heading', { name: 'Rotating photos' })).toBeVisible()
    await context.close()
  })

  test('a plain member is redirected away from Admin', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/admin`)
    // requirePortalContentAdmin bounces non-admins to the public home.
    await expect(page).toHaveURL(`${WEB_URL}/`)
    await expect(page.getByRole('heading', { name: 'Rotating photos' })).toHaveCount(0)
    await context.close()
  })
})
