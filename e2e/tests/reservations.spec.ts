// Browser smoke tests for the reservations app: portal sign-in redirect, the
// pending-user gate, calendar rendering, and a booking flow end-to-end.

import { test, expect } from '@playwright/test'
import { RESERVATIONS_URL, WEB_URL } from '../../playwright.config'
import { contextFor } from '../session'

test.describe('reservations portal', () => {
  test('signed-out visitors are redirected to the portal sign-in', async ({ page }) => {
    await page.goto(`${RESERVATIONS_URL}/reservations/calendar`)

    // Sign-in is centralized on the portal; the gate sends signed-out users
    // there with a callbackUrl. Requires the reservations app to be built with
    // NEXT_PUBLIC_HOME_URL=<web url> so the redirect stays local in e2e.
    await expect(page).toHaveURL(new RegExp(`^${WEB_URL}/sign-in\\?callbackUrl=`))
    await expect(page.getByRole('heading', { name: 'Miller Family Reunions' })).toBeVisible()
  })

  test('pending users are held at the pending page', async ({ browser }) => {
    const context = await contextFor(browser, 'pending')
    const page = await context.newPage()

    await page.goto(`${RESERVATIONS_URL}/reservations/calendar`)

    await expect(page).toHaveURL(/\/reservations\/pending/)
    await expect(
      page.getByRole('heading', { name: 'Your access is pending approval' }),
    ).toBeVisible()
    await context.close()
  })

  test('approved members see the calendar', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()

    await page.goto(`${RESERVATIONS_URL}/reservations/calendar`)

    await expect(page).toHaveURL(/\/reservations\/calendar/)
    // The signed-in app chrome is present (header + nav), not a login page.
    await expect(page.getByText('member@e2e.test')).toBeVisible()
    await context.close()
  })

  test('a member can create a reservation and see it listed', async ({ browser }) => {
    const context = await contextFor(browser, 'member')

    // Create through the real API route, authenticated by the session cookie —
    // exercises auth, booking-rules validation, and persistence end to end.
    const response = await context.request.post(
      `${RESERVATIONS_URL}/reservations/api/reservations`,
      { data: { startDate: '2027-05-10', endDate: '2027-05-12' } },
    )
    expect(response.ok(), await response.text()).toBe(true)

    const page = await context.newPage()
    await page.goto(`${RESERVATIONS_URL}/reservations/my-reservations`)

    await expect(page.getByRole('heading', { name: 'My reservations' })).toBeVisible()
    // Ranges display as check-in → check-out (endDate is the exclusive checkout
    // day): a May 10 → May 12 checkout stay (2 nights) reads "May 10 → May 12".
    await expect(page.getByRole('button', { name: /May 10 → May 12/ })).toBeVisible()
    await context.close()
  })

  test('admins can open the admin page', async ({ browser }) => {
    const context = await contextFor(browser, 'admin')
    const page = await context.newPage()

    await page.goto(`${RESERVATIONS_URL}/reservations/admin`)

    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible()
    await context.close()
  })

  test('non-admins cannot use the admin API', async ({ browser }) => {
    const context = await contextFor(browser, 'member')

    // /api/admin/users was removed with PR1 (the portal owns user management);
    // booking-rules is the surviving role-gated admin API.
    const response = await context.request.get(
      `${RESERVATIONS_URL}/reservations/api/admin/booking-rules`,
    )

    expect(response.status()).toBe(403)
    await context.close()
  })
})
