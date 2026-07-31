// Linking a login to a Shareholder by name, end to end.
//
// The case that motivated it: a Shareholder row is a household ("John and
// Michele Anderegg") carrying one spouse's email, so the other spouse's login
// never matches by email and used to have no way in at all. The admin links
// them by name here, and the member must then actually see their dashboard —
// which only works because extendSession falls back to a by-userId lookup.

import { test, expect } from '@playwright/test'
import { ACCOUNTING_URL } from '../../playwright.config'
import { contextFor } from '../session'
import { personas } from '../personas'

const SHAREHOLDERS = `${ACCOUNTING_URL}/accounting/admin/shareholders`

// Contains the household persona's name ("E2E Spouse") plus extra words, so it
// is a suggested match; its email belongs to somebody else entirely.
const HOUSEHOLD_NAME = 'E2E Partner and E2E Spouse'

test.describe('shareholder linking', () => {
  test('an admin links a login by name and the member reaches their dashboard', async ({
    browser,
  }) => {
    const admin = await contextFor(browser, 'admin')
    const page = await admin.newPage()

    // A household shareholder whose email is NOT the persona's login email.
    await page.goto(`${SHAREHOLDERS}/new`)
    await page.getByLabel('Name').fill(HOUSEHOLD_NAME)
    await page.getByLabel(/Email/).fill('e2e-partner@e2e.test')
    await page.getByRole('button', { name: 'Add shareholder' }).click()
    await expect(page).toHaveURL(/\/accounting\/admin\/shareholders$/)

    const row = page.locator('tr').filter({ hasText: HOUSEHOLD_NAME })
    await expect(row.getByText('Not yet signed in')).toBeVisible()

    // The dialog suggests the spouse by name, and links in one click.
    await row.getByRole('button', { name: 'Link' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Suggested')).toBeVisible()

    const suggestion = dialog.locator('li').filter({ hasText: personas.household.name })
    await expect(suggestion.getByText('Name matches')).toBeVisible()
    await suggestion.getByRole('button', { name: 'Link' }).click()

    await expect(row.getByText('Linked')).toBeVisible()
    await admin.close()

    // The payoff: the linked member now has a dashboard, even though their
    // login email appears on no shareholder record.
    const spouse = await contextFor(browser, 'household')
    const spousePage = await spouse.newPage()
    await spousePage.goto(`${ACCOUNTING_URL}/accounting/dashboard`)
    await expect(spousePage).toHaveURL(/\/accounting\/dashboard/)
    await expect(spousePage.getByText(HOUSEHOLD_NAME).first()).toBeVisible()
    await spouse.close()
  })

  // Deliberately links nobody, so it leaves no state for later specs: the
  // point is that a non-match cannot be linked by a single click.
  test('linking a login whose name does not match requires a confirmation', async ({ browser }) => {
    const admin = await contextFor(browser, 'admin')
    const page = await admin.newPage()

    const unmatched = 'E2E Nobody Matches This'
    await page.goto(`${SHAREHOLDERS}/new`)
    await page.getByLabel('Name').fill(unmatched)
    await page.getByRole('button', { name: 'Add shareholder' }).click()
    await expect(page).toHaveURL(/\/accounting\/admin\/shareholders$/)

    const row = page.locator('tr').filter({ hasText: unmatched })
    await row.getByRole('button', { name: 'Link' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('No name matches — pick manually')).toBeVisible()

    const nonMatch = dialog.locator('li').filter({ hasText: personas.outsider.name })
    await expect(nonMatch.getByText('Name matches')).toHaveCount(0)
    await nonMatch.getByRole('button', { name: 'Link' }).click()

    // A confirmation naming both sides, not a link.
    await expect(dialog.getByText(/doesn't appear in/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Back' }).click()

    await page.getByRole('button', { name: 'Close' }).click()
    await expect(row.getByText('Not yet signed in')).toBeVisible()

    await admin.close()
  })
})
