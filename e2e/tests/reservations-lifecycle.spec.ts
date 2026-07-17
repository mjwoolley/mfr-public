// The full reservation lifecycle through the real UI — create, edit, cancel —
// plus the booking-rule rejections (overlap, horizon, blocked dates) and the
// calendar/summary read surfaces. Complements reservations.spec.ts's smoke
// checks. The lifecycle stay sits in the current calendar year (the summary
// page only shows the current year); the rejection tests use July–August 2027
// so this file and reservations.spec.ts never collide on dates.

import { test, expect, type Page } from '@playwright/test'
import { RESERVATIONS_URL } from '../../playwright.config'
import { contextFor } from '../session'

const MY_RESERVATIONS = `${RESERVATIONS_URL}/reservations/my-reservations`
const API = `${RESERVATIONS_URL}/reservations/api`

/** Fill the booking dialog's date fields. `lastNight` is the inclusive last
 * night shown in the UI (checkout − 1). */
async function fillBookingDates(page: Page, checkIn: string, lastNight: string) {
  await page.locator('#booking-check-in').fill(checkIn)
  await page.locator('#booking-last-night').fill(lastNight)
}

test.describe('reservation lifecycle (UI)', () => {
  test('create → edit → cancel round-trip on My reservations', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(MY_RESERVATIONS)

    // Create: Sep 1 → Sep 3 2026 (checkout), shown as Sep 1 → Sep 2.
    await page.getByRole('button', { name: 'New reservation' }).click()
    await fillBookingDates(page, '2026-09-01', '2026-09-02')
    await expect(page.getByText('2 nights at the cabin')).toBeVisible()
    await page.getByRole('button', { name: 'Confirm reservation' }).click()
    const created = page.getByRole('button', { name: /Sep 1 → Sep 2/ })
    await expect(created).toBeVisible()

    // Edit: extend to Sep 4 (last night Sep 3).
    await page.getByRole('button', { name: 'Edit' }).first().click()
    await page.locator('#booking-last-night').fill('2026-09-03')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('button', { name: /Sep 1 → Sep 3/ })).toBeVisible()

    // The summary page reflects the stay.
    await page.goto(`${RESERVATIONS_URL}/reservations/summary`)
    await expect(page.getByRole('heading', { name: 'Reservations Summary' })).toBeVisible()
    await expect(page.getByText('E2E Member')).toBeVisible()

    // Cancel: the row disappears.
    await page.goto(MY_RESERVATIONS)
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click()
    await expect(page.getByRole('button', { name: /Sep 1 → Sep 3/ })).toHaveCount(0)

    await context.close()
  })

  test('overlapping dates are rejected in the dialog and by the API', async ({ browser }) => {
    const member = await contextFor(browser, 'member')
    // An existing member stay: July 10 → July 13 2027.
    const seeded = await member.request.post(`${API}/reservations`, {
      data: { startDate: '2027-07-10', endDate: '2027-07-13' },
    })
    expect(seeded.ok(), await seeded.text()).toBe(true)

    // Another member sees live validation reject the overlap in the dialog…
    const outsider = await contextFor(browser, 'outsider')
    const page = await outsider.newPage()
    await page.goto(MY_RESERVATIONS)
    await page.getByRole('button', { name: 'New reservation' }).click()
    await fillBookingDates(page, '2027-07-11', '2027-07-11')
    await expect(page.getByText('Those dates overlap an existing reservation.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirm reservation' })).toBeDisabled()

    // …and the server enforces it independently of the client.
    const apiAttempt = await outsider.request.post(`${API}/reservations`, {
      data: { startDate: '2027-07-11', endDate: '2027-07-12' },
    })
    expect(apiAttempt.ok()).toBe(false)

    await outsider.close()
    await member.close()
  })

  test('dates beyond the booking horizon are rejected', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(MY_RESERVATIONS)

    // global-setup seeds the horizon at 2030-12-31.
    await page.getByRole('button', { name: 'New reservation' }).click()
    await fillBookingDates(page, '2031-01-05', '2031-01-06')
    await expect(page.getByText(/Reservations cannot start after 2030-12-31/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirm reservation' })).toBeDisabled()

    const apiAttempt = await context.request.post(`${API}/reservations`, {
      data: { startDate: '2031-01-05', endDate: '2031-01-07' },
    })
    expect(apiAttempt.ok()).toBe(false)

    await context.close()
  })

  test('blocked dates reject member bookings', async ({ browser }) => {
    // Admin blocks Aug 10–13 2027 through the real admin API.
    const admin = await contextFor(browser, 'admin')
    const blocked = await admin.request.post(`${API}/admin/blocked-dates`, {
      data: { startDate: '2027-08-10', endDate: '2027-08-13', reason: 'maintenance' },
    })
    expect(blocked.ok(), await blocked.text()).toBe(true)
    const { blockedDate } = await blocked.json()

    const member = await contextFor(browser, 'member')
    const page = await member.newPage()
    await page.goto(MY_RESERVATIONS)
    await page.getByRole('button', { name: 'New reservation' }).click()
    await fillBookingDates(page, '2027-08-11', '2027-08-11')
    await expect(page.getByText('Those dates are blocked and unavailable.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirm reservation' })).toBeDisabled()

    const apiAttempt = await member.request.post(`${API}/reservations`, {
      data: { startDate: '2027-08-11', endDate: '2027-08-12' },
    })
    expect(apiAttempt.ok()).toBe(false)

    // Clean up the block so later tests (and re-runs) start unobstructed.
    const removed = await admin.request.delete(`${API}/admin/blocked-dates/${blockedDate.id}`)
    expect(removed.ok()).toBe(true)

    await member.close()
    await admin.close()
  })

  test('calendar month navigation moves forward and back', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${RESERVATIONS_URL}/reservations/calendar`)

    // The month label is the calendar's h1 (e.g. "July 2026").
    const monthHeading = page.getByRole('heading', { name: /^[A-Z][a-z]+ 20\d\d$/ })
    const startLabel = await monthHeading.textContent()

    await page.getByRole('button', { name: 'Next month' }).click()
    await expect(monthHeading).not.toHaveText(startLabel ?? '')

    await page.getByRole('button', { name: 'Previous month' }).click()
    await expect(monthHeading).toHaveText(startLabel ?? '')

    await context.close()
  })
})
