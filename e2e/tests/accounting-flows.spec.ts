// Accounting money flows through the real UI: the admin records transactions
// via the Share transactions dialogs, the member sees them land on their
// dashboard/contributions/inbox, confirms via the approval inbox, and the
// admin corrects a mistake (soft-deleting the original). Complements
// accounting.spec.ts's access-gate smoke checks.
//
// Runs serially within this file (fullyParallel is off) — later tests build
// on earlier ones' ledger state, all of it seeded fresh by global-setup.

import { test, expect, type Page } from '@playwright/test'
import { ACCOUNTING_URL } from '../../playwright.config'
import { contextFor } from '../session'

const ADMIN_TRANSACTIONS = `${ACCOUNTING_URL}/accounting/admin/transactions`

async function openDialog(page: Page, button: string) {
  await page.goto(ADMIN_TRANSACTIONS)
  await page.getByRole('button', { name: button, exact: true }).click()
}

test.describe('accounting flows', () => {
  test('admin records a contribution; it reaches the history and the member dashboard', async ({
    browser,
  }) => {
    const admin = await contextFor(browser, 'admin')
    const page = await admin.newPage()

    await openDialog(page, 'Record contribution')
    await page.getByLabel('Shareholder').selectOption({ label: 'E2E Member' })
    await page.getByLabel('Amount (USD)').fill('250')
    await page.getByLabel('Description').fill('e2e seed contribution')
    await page.getByRole('button', { name: 'Record contribution' }).last().click()

    // Dialog closes and the history lists the new entry ("E2E Member +$250").
    await expect(page.getByText('e2e seed contribution')).toBeVisible()
    await expect(page.getByText('E2E Member +$250')).toBeVisible()
    await admin.close()

    // The member's dashboard shows the new balance ($1 = 1 share).
    const member = await contextFor(browser, 'member')
    const memberPage = await member.newPage()
    await memberPage.goto(`${ACCOUNTING_URL}/accounting/dashboard`)
    await expect(memberPage.getByRole('heading', { name: 'E2E Member' })).toBeVisible()
    await expect(memberPage.getByText('$250').first()).toBeVisible()

    // And the Contributions view includes it.
    await memberPage.goto(`${ACCOUNTING_URL}/accounting/contributions`)
    await expect(
      memberPage.getByRole('heading', { name: 'Contributions', exact: true }),
    ).toBeVisible()
    await expect(memberPage.getByText('E2E Member').first()).toBeVisible()
    await member.close()
  })

  test('member confirms the contribution from the approval inbox', async ({ browser }) => {
    const member = await contextFor(browser, 'member')
    const page = await member.newPage()

    await page.goto(`${ACCOUNTING_URL}/accounting/inbox`)
    await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()

    await page.getByRole('button', { name: 'Confirm' }).first().click()

    // Confirming clears the pending queue.
    await expect(page.getByText("You're all caught up")).toBeVisible()
    await member.close()
  })

  test('admin adds a shareholder and records a transfer between shareholders', async ({
    browser,
  }) => {
    const admin = await contextFor(browser, 'admin')
    const page = await admin.newPage()

    // New shareholder via the real form (no email — optional since Phase 11).
    await page.goto(`${ACCOUNTING_URL}/accounting/admin/shareholders/new`)
    await page.getByLabel('Name').fill('E2E Transferee')
    await page.getByRole('button', { name: 'Add shareholder' }).click()
    await expect(page).toHaveURL(/\/accounting\/admin\/shareholders/)
    await expect(page.getByText('E2E Transferee')).toBeVisible()

    // Transfer 100 of the member's 250 shares to the new shareholder.
    await openDialog(page, 'Record transfer')
    await page.getByLabel('From', { exact: true }).selectOption({ label: 'E2E Member' })
    await page.getByLabel('To', { exact: true }).selectOption({ label: 'E2E Transferee' })
    await page.getByLabel(/Amount \(USD\)/).fill('100')
    await page.getByLabel('Description').fill('e2e transfer')
    await page.getByRole('button', { name: 'Record transfer' }).last().click()
    // "E2E Member → E2E Transferee · $100"
    await expect(page.getByText('E2E Member → E2E Transferee · $100')).toBeVisible()

    await admin.close()

    // Member's balance reflects 250 − 100.
    const member = await contextFor(browser, 'member')
    const memberPage = await member.newPage()
    await memberPage.goto(`${ACCOUNTING_URL}/accounting/dashboard`)
    await expect(memberPage.getByText('$150').first()).toBeVisible()
    await member.close()
  })

  test('admin corrects the transfer; the original is struck and totals restored', async ({
    browser,
  }) => {
    const admin = await contextFor(browser, 'admin')
    const page = await admin.newPage()
    await page.goto(ADMIN_TRANSACTIONS)

    // Correct the transfer (the newest non-deleted row with a Correct button).
    await page.getByRole('button', { name: 'Correct', exact: true }).first().click()
    // Defaults are a full reversal (−(−100) and −100) with a required note.
    await page.getByLabel('Description').fill('e2e correction — undo transfer')
    await page.getByRole('button', { name: 'Record correction' }).last().click()

    await expect(page.getByText('e2e correction — undo transfer')).toBeVisible()
    // The original transfer now carries the Corrected strike-through tag.
    await expect(page.getByText('Corrected', { exact: true }).first()).toBeVisible()
    await admin.close()

    // Correction reverses the transfer: member back to 250.
    const member = await contextFor(browser, 'member')
    const memberPage = await member.newPage()
    await memberPage.goto(`${ACCOUNTING_URL}/accounting/dashboard`)
    await expect(memberPage.getByText('$250').first()).toBeVisible()
    await member.close()
  })

  test('ownership report shows the shareholder split', async ({ browser }) => {
    const member = await contextFor(browser, 'member')
    const page = await member.newPage()

    await page.goto(`${ACCOUNTING_URL}/accounting/ownership`)
    await expect(page.getByRole('heading', { name: 'Ownership report' })).toBeVisible()
    // E2E Member holds 250 shares (contribution, transfer then reversed).
    await expect(page.getByText('E2E Member').first()).toBeVisible()
    // E2E Transferee's 100 shares were reversed by the correction, leaving a
    // zero balance — the report hides zero-balance shareholders.
    await expect(page.getByText('E2E Transferee')).toHaveCount(0)

    await member.close()
  })
})
