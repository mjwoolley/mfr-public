// Browser smoke tests for the portal app: public home rendering, sign-in
// redirects, and the member/admin nav states (personas seeded by
// e2e/global-setup.ts).

import { test, expect } from '@playwright/test'
import { WEB_URL } from '../../playwright.config'
import { contextFor } from '../session'

test.describe('web portal', () => {
  test('landing page renders the hero and nav tab links', async ({ page }) => {
    await page.goto(WEB_URL)

    await expect(page.getByText('Lake Lure, North Carolina', { exact: true })).toBeVisible()
    // The section links live in the shared tab-bar nav now (the old app cards
    // are gone). One origin, so they are same-origin relative paths rather
    // than the former cross-subdomain absolute URLs. A signed-out visitor gets
    // the generic sign-in prompt instead of the member-only goal card.
    await expect(page.getByRole('link', { name: 'Reservations', exact: true })).toHaveAttribute(
      'href',
      '/reservations',
    )
    await expect(page.getByRole('link', { name: 'Accounting', exact: true })).toHaveAttribute(
      'href',
      '/accounting',
    )
    await expect(page.getByText(/Sign in to see this year/)).toBeVisible()
  })

  test('nav collapses to a hamburger menu on a mobile viewport', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(WEB_URL)

    // Tab links are hidden until the Menu button opens the panel.
    const menuButton = page.getByRole('button', { name: 'Menu' })
    await expect(menuButton).toBeVisible()
    await expect(page.getByRole('link', { name: 'Photos', exact: true })).toBeHidden()

    await menuButton.click()
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('link', { name: 'Photos', exact: true })).toBeVisible()

    // Navigating via a menu link closes the panel again.
    await page.getByRole('link', { name: 'Photos', exact: true }).click()
    await expect(page).toHaveURL(`${WEB_URL}/photos`)
    await expect(page.getByRole('link', { name: 'Photos', exact: true })).toBeHidden()
    await context.close()
  })

  test('sign-in page offers Google sign-in when signed out', async ({ page }) => {
    await page.goto(`${WEB_URL}/sign-in`)

    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
  })

  test('sign-in page redirects home when already signed in', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()

    await page.goto(`${WEB_URL}/sign-in`)

    await expect(page).toHaveURL(`${WEB_URL}/`)
    await context.close()
  })

  test('the site owner can reach User Management', async ({ browser }) => {
    const context = await contextFor(browser, 'owner')
    const page = await context.newPage()

    await page.goto(`${WEB_URL}/admin/users`)

    await expect(page.getByRole('heading', { name: 'User management' })).toBeVisible()
    await context.close()
  })

  test('a non-owner is redirected away from User Management', async ({ browser }) => {
    const context = await contextFor(browser, 'admin')
    const page = await context.newPage()

    await page.goto(`${WEB_URL}/admin/users`)

    // requireSiteOwner bounces a non-owner (even an admin) to the home page.
    await expect(page).toHaveURL(`${WEB_URL}/`)
    await context.close()
  })

  test('Photos redirects a signed-out visitor to sign-in', async ({ page }) => {
    await page.goto(`${WEB_URL}/photos`)
    await expect(page).toHaveURL(new RegExp(`^${WEB_URL}/sign-in`))
  })

  test('a signed-in member sees the Photos albums by year', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/photos`)
    await expect(page.getByRole('heading', { name: 'Albums' })).toBeVisible()
    await expect(page.getByText('2026', { exact: true }).first()).toBeVisible()
    await context.close()
  })

  test('Documents redirects a signed-out visitor to sign-in', async ({ page }) => {
    // Every gated tab funnels to the single portal sign-in screen — the old
    // inline "locked" prompt is gone.
    await page.goto(`${WEB_URL}/documents`)
    await expect(page).toHaveURL(new RegExp(`^${WEB_URL}/sign-in`))
  })

  test('Documents renders for a member and gates the Drive link to admins', async ({ browser }) => {
    // Documents is now a native, in-site file browser; the outbound Drive link
    // is editor-only. CI has no service-account key, so live folder contents
    // aren't available here — we assert the gated page shell renders for a
    // member (without the admin link) and that a content-admin does see it.
    const memberCtx = await contextFor(browser, 'member')
    const memberPage = await memberCtx.newPage()
    await memberPage.goto(`${WEB_URL}/documents`)
    await expect(memberPage.getByRole('heading', { name: 'Family documents.' })).toBeVisible()
    await expect(memberPage.getByRole('link', { name: 'Manage in Google Drive' })).toHaveCount(0)
    await memberCtx.close()

    const adminCtx = await contextFor(browser, 'admin')
    const adminPage = await adminCtx.newPage()
    await adminPage.goto(`${WEB_URL}/documents`)
    await expect(adminPage.getByRole('link', { name: 'Manage in Google Drive' })).toBeVisible()
    await adminCtx.close()
  })

  test('Meals redirects a signed-out visitor to sign-in', async ({ page }) => {
    await page.goto(`${WEB_URL}/meals`)
    await expect(page).toHaveURL(new RegExp(`^${WEB_URL}/sign-in`))
  })

  test('a signed-in member can fill in Meals', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/meals`)
    // The heading uses a typographic apostrophe (&rsquo;) — match it exactly.
    await expect(page.getByRole('heading', { name: 'Who’s here for which meals?' })).toBeVisible()
    await context.close()
  })

  test('the Admin content area gates non-admins but admits managers', async ({ browser }) => {
    const outsiderCtx = await contextFor(browser, 'member')
    const outsiderPage = await outsiderCtx.newPage()
    await outsiderPage.goto(`${WEB_URL}/admin`)
    await expect(outsiderPage).toHaveURL(`${WEB_URL}/`)
    await outsiderCtx.close()

    const adminCtx = await contextFor(browser, 'admin')
    const adminPage = await adminCtx.newPage()
    await adminPage.goto(`${WEB_URL}/admin`)
    await expect(adminPage.getByRole('heading', { name: 'Site settings.' })).toBeVisible()
    await adminCtx.close()
  })
})
