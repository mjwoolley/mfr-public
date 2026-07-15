import { test, expect } from '@playwright/test'
import { WEB_URL } from '../../playwright.config'
import { contextFor } from '../session'

test.describe('web portal', () => {
  test('landing page renders the hero and portal links', async ({ page }) => {
    await page.goto(WEB_URL)

    await expect(page.getByText('Lake Lure, North Carolina', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Reservations' })).toHaveAttribute(
      'href',
      'https://reservations.millerfamilyreunions.org/reservations',
    )
    await expect(page.getByRole('link', { name: 'Open Accounting' })).toHaveAttribute(
      'href',
      'https://accounting.millerfamilyreunions.org/accounting',
    )
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

  test('the Photos page lists albums by year (public)', async ({ page }) => {
    await page.goto(`${WEB_URL}/photos`)
    await expect(page.getByRole('heading', { name: 'Photos, year by year.' })).toBeVisible()
    await expect(page.getByText('2026', { exact: true }).first()).toBeVisible()
  })

  test('Documents is locked for signed-out visitors', async ({ page }) => {
    await page.goto(`${WEB_URL}/documents`)
    await expect(page.getByText('Sign in to view family documents')).toBeVisible()
  })

  test('a signed-in member sees the Documents folder', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/documents`)
    await expect(page.getByRole('link', { name: 'Open in Google Drive' })).toBeVisible()
    await context.close()
  })

  test('Meals redirects a signed-out visitor to sign-in', async ({ page }) => {
    await page.goto(`${WEB_URL}/meals`)
    await expect(page).toHaveURL(new RegExp(`^${WEB_URL}/sign-in`))
  })

  test('a signed-in member can fill in Meals', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/meals`)
    await expect(page.getByRole('heading', { name: "Who's here for which meals?" })).toBeVisible()
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
