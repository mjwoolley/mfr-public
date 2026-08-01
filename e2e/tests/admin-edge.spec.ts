// Admin capabilities and edge cases: booking-rules changes visibly
// constraining members, blocked-dates admin CRUD through the UI, the portal's
// User Management approve/block + role-grant flow, meal RSVP persistence,
// and empty states. Mutated cross-cutting state (rules) is restored in-test;
// the suite runs single-worker (see playwright.config.ts) so nothing races.

import { test, expect } from '@playwright/test'
import { WEB_URL, RESERVATIONS_URL } from '../../playwright.config'
import { contextFor } from '../session'

test.describe('reservations admin', () => {
  test('tightening the booking rules immediately constrains member bookings', async ({
    browser,
  }) => {
    const admin = await contextFor(browser, 'admin')
    const adminPage = await admin.newPage()

    // Tighten max consecutive nights 14 → 5 through the real admin form.
    await adminPage.goto(`${RESERVATIONS_URL}/reservations/admin/booking-rules`)
    await adminPage.getByLabel('Max consecutive nights per reservation').fill('5')
    await adminPage.getByRole('button', { name: 'Save changes' }).click()
    await expect(adminPage.getByText('Saved.')).toBeVisible()

    // A member's 6-night attempt now fails live validation.
    const member = await contextFor(browser, 'member')
    const memberPage = await member.newPage()
    await memberPage.goto(`${RESERVATIONS_URL}/reservations/my-reservations`)
    await memberPage.getByRole('button', { name: 'New reservation' }).click()
    await memberPage.locator('#booking-check-in').fill('2026-10-01')
    // Check-out Oct 7 = 6 nights (Oct 1–6), one over the tightened max of 5.
    await memberPage.locator('#booking-check-out').fill('2026-10-07')
    await expect(
      memberPage.getByText('Reservations cannot exceed 5 consecutive nights.'),
    ).toBeVisible()
    await expect(memberPage.getByRole('button', { name: 'Confirm reservation' })).toBeDisabled()
    await member.close()

    // Restore the seeded rules so later tests (and re-runs) see them.
    const restore = await admin.request.patch(
      `${RESERVATIONS_URL}/reservations/api/admin/booking-rules`,
      { data: { maxConsecutiveNights: 14 } },
    )
    expect(restore.ok(), await restore.text()).toBe(true)
    await admin.close()
  })

  test('blocked dates are managed through the admin page', async ({ browser }) => {
    const admin = await contextFor(browser, 'admin')
    const page = await admin.newPage()

    await page.goto(`${RESERVATIONS_URL}/reservations/admin/blocked-dates`)
    await page.getByLabel('Start date').fill('2027-09-10')
    await page.getByLabel('End date').fill('2027-09-12')
    await page.getByLabel('Reason (optional)').fill('e2e admin block')
    await page.getByRole('button', { name: 'Block these dates' }).click()

    await expect(page.getByText('e2e admin block')).toBeVisible()

    await page.getByRole('button', { name: 'Remove', exact: true }).first().click()
    await expect(page.getByText('e2e admin block')).toHaveCount(0)

    await admin.close()
  })
})

test.describe('portal user management', () => {
  test('the owner approves an applicant, grants a role, and can block', async ({ browser }) => {
    const owner = await contextFor(browser, 'owner')
    const page = await owner.newPage()
    await page.goto(`${WEB_URL}/admin/users`)

    const row = page.locator('.card').filter({ hasText: 'applicant@e2e.test' })

    // Park the applicant on the pending page *before* approving, so the reload
    // below reproduces what a real person does: sit on "pending approval", get
    // approved, hit refresh. This used to strand them — the page rendered the
    // waiting message unconditionally, so only a sign-out/sign-in got them in.
    const applicant = await contextFor(browser, 'applicant')
    const applicantPage = await applicant.newPage()
    await applicantPage.goto(`${RESERVATIONS_URL}/reservations/calendar`)
    await expect(applicantPage).toHaveURL(/\/reservations\/pending/)

    // Approve the pending applicant.
    await expect(row.getByText('pending', { exact: true })).toBeVisible()
    await row.getByRole('button', { name: 'Approve' }).click()
    await expect(row.getByText('approved', { exact: true })).toBeVisible()

    // A plain reload of the pending page is enough — no sign-out required. It
    // lands on /reservations, which forwards to the calendar.
    await applicantPage.reload()
    await expect(applicantPage).toHaveURL(/\/reservations\/calendar/)
    await applicant.close()

    // Grant a role (button flips to pressed with a ✓), then revoke it.
    await row.getByRole('button', { name: 'Site manager' }).click()
    const granted = row.getByRole('button', { name: '✓ Site manager' })
    await expect(granted).toBeVisible()
    await granted.click()
    await expect(row.getByRole('button', { name: 'Site manager', exact: true })).toBeVisible()

    // Block the applicant (their arc ends here — no other spec uses them).
    await row.getByRole('button', { name: 'Block' }).click()
    await expect(row.getByText('blocked', { exact: true })).toBeVisible()

    await owner.close()
  })

  test('a non-owner admin cannot open User Management', async ({ browser }) => {
    const admin = await contextFor(browser, 'admin') // site manager, not owner
    const page = await admin.newPage()

    await page.goto(`${WEB_URL}/admin/users`)
    await expect(page).not.toHaveURL(/\/admin\/users/)

    await admin.close()
  })
})

test.describe('meals RSVPs', () => {
  test("a member's meal toggle persists across reloads", async ({ browser }) => {
    const member = await contextFor(browser, 'member')
    const page = await member.newPage()

    await page.goto(`${WEB_URL}/meals`)
    // global-setup pins the reunion week, so the grid always renders.
    const firstLunch = page.getByRole('button', { name: /Lunch/ }).first()
    await expect(firstLunch).toHaveText('Lunch')

    // The pill flips optimistically (useOptimistic) while toggleMeal runs in a
    // transition, so wait for the server action's POST to /meals to actually
    // resolve before reloading — otherwise the reload can race the (remote
    // Neon) write and read back the pre-toggle state.
    await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().endsWith('/meals') && r.status() === 200,
      ),
      firstLunch.click(),
    ])
    await expect(firstLunch).toHaveText('✓ Lunch')

    await page.reload()
    await expect(page.getByRole('button', { name: /Lunch/ }).first()).toHaveText('✓ Lunch')

    await member.close()
  })
})

test.describe('empty states', () => {
  test('a member with no bookings sees the My Reservations empty state', async ({ browser }) => {
    const outsider = await contextFor(browser, 'outsider')
    const page = await outsider.newPage()

    await page.goto(`${RESERVATIONS_URL}/reservations/my-reservations`)
    await expect(page.getByText(/No reservations yet/)).toBeVisible()

    await outsider.close()
  })
})
