// Linking a login to a Shareholder, end to end, plus the shareholders list's
// mobile layout.
//
// The case that motivated linking: a Shareholder row is a household ("John and
// Michele Anderegg") carrying one spouse's email, so the other spouse's login
// never matches by email and used to have no way in at all. The admin links
// them from the Edit screen here, and the member must then actually see their
// dashboard — which only works because extendSession falls back to a by-userId
// lookup.

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
    await expect(row.getByText('Not linked')).toBeVisible()

    // Linking lives on the Edit screen.
    await row.getByRole('link', { name: 'Edit' }).click()
    const picker = page.getByLabel('Link a login')

    // The spouse is offered as a name match, not buried among everyone else.
    // Matched on the label ATTRIBUTE — an optgroup's own text is its options.
    const suggested = picker.locator('optgroup[label^="Suggested"]')
    await expect(suggested.locator('option', { hasText: personas.household.name })).toHaveCount(1)

    await picker.selectOption({ label: `${personas.household.name} — ${personas.household.email}` })
    await page.getByRole('button', { name: 'Link', exact: true }).click()

    // The household's email is the OTHER spouse's, so linking raises the
    // keep-or-adopt choice. Keeping it is the whole point of the household
    // case: john@ must survive linking Michele.
    await expect(page.getByText(/differs from the shareholder/)).toBeVisible()
    await page.getByRole('button', { name: /Link, keep e2e-partner@e2e\.test/ }).click()
    await expect(page.getByText(`Linked to ${personas.household.name}`)).toBeVisible()

    // The list now names the login on its own line under the person's name.
    // Scoped to the Login cell: the shareholder's own name contains the
    // persona's name as a substring, so a row-wide text match is ambiguous.
    await page.goto(SHAREHOLDERS)
    const householdRow = page.locator('tr').filter({ hasText: HOUSEHOLD_NAME })
    // Column 1 keeps the shareholder's own email — it was NOT adopted.
    await expect(householdRow.locator('td').nth(0)).toContainText('e2e-partner@e2e.test')
    const loginCell = householdRow.locator('td').nth(1)
    await expect(loginCell).toContainText(personas.household.name)
    await expect(loginCell).toContainText(personas.household.email)
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

    await page
      .locator('tr')
      .filter({ hasText: unmatched })
      .getByRole('link', { name: 'Edit' })
      .click()

    // Nothing matches this name, so the whole list is grouped as such.
    const picker = page.getByLabel('Link a login')
    await expect(picker.locator('optgroup[label="No name matches"]')).toHaveCount(1)

    await picker.selectOption({ label: `${personas.outsider.name} — ${personas.outsider.email}` })
    await page.getByRole('button', { name: 'Link', exact: true }).click()

    // A confirmation naming both sides, not a link.
    await expect(page.getByText(/doesn't appear in/)).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()

    await page.goto(SHAREHOLDERS)
    await expect(
      page.locator('tr').filter({ hasText: unmatched }).getByText('Not linked'),
    ).toBeVisible()

    await admin.close()
  })

  // A shareholder with no email of its own: linking should just fill it in,
  // with no prompt. This is what makes the record resolvable by extendSession's
  // by-email lookup afterwards.
  test('linking a shareholder with no email fills it in silently', async ({ browser }) => {
    const admin = await contextFor(browser, 'admin')
    const page = await admin.newPage()

    // Named so the visitor persona is a *suggested* match — otherwise the
    // name-mismatch prompt fires and this test stops being about the email.
    const blankName = 'E2E Visitor Household'
    await page.goto(`${SHAREHOLDERS}/new`)
    await page.getByLabel('Name').fill(blankName)
    await page.getByRole('button', { name: 'Add shareholder' }).click()
    await expect(page).toHaveURL(/\/accounting\/admin\/shareholders$/)

    const row = page.locator('tr').filter({ hasText: blankName })
    await expect(row.locator('td').nth(0)).toContainText('No email')

    await row.getByRole('link', { name: 'Edit' }).click()
    await page
      .getByLabel('Link a login')
      .selectOption({ label: `${personas.visitor.name} — ${personas.visitor.email}` })
    await page.getByRole('button', { name: 'Link', exact: true }).click()

    // No keep-or-adopt choice — there was nothing to overwrite.
    await expect(page.getByText(/differs from the shareholder/)).toHaveCount(0)
    await expect(page.getByText(`Linked to ${personas.visitor.name}`)).toBeVisible()

    // The record now carries the login's address.
    await page.goto(SHAREHOLDERS)
    await expect(
      page.locator('tr').filter({ hasText: blankName }).locator('td').nth(0),
    ).toContainText(personas.visitor.email)

    await admin.close()
  })

  // The list is read on phones. Asserting the layout is what stops the columns
  // creeping back and reintroducing a sideways scroll.
  test('the shareholders list fits a phone screen', async ({ browser }) => {
    const admin = await contextFor(browser, 'admin')
    const page = await admin.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(SHAREHOLDERS)
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows, 'shareholders list scrolls sideways at 390px').toBe(false)

    // Three columns: Name, Login, and the unlabelled Edit cell.
    await expect(page.locator('thead th')).toHaveCount(3)
    await expect(page.getByRole('columnheader', { name: 'Status' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Login linked' })).toHaveCount(0)

    await admin.close()
  })
})
