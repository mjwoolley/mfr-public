// Requirement coverage (CAP-042 "Recording starts from the history") for the
// one record form no other e2e test drives: "Record adjustment". Uses its own
// freshly created shareholder so no other spec's balances move.
//
// The loose correction test in accounting-flows.spec.ts is intentionally left
// as it is (see CAP-036's open question on the correction defaults).

import { test, expect } from '@playwright/test'
import { ACCOUNTING_URL } from '../../playwright.config'
import { contextFor } from '../session'

test('CAP-042 · Recording starts from the history (Record adjustment)', async ({ browser }) => {
  const name = `E2E Req Adjustee ${Date.now()}`
  const admin = await contextFor(browser, 'admin')
  const page = await admin.newPage()

  await page.goto(`${ACCOUNTING_URL}/accounting/admin/shareholders/new`)
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Add shareholder' }).click()
  await expect(page.getByText(name)).toBeVisible()

  await page.goto(`${ACCOUNTING_URL}/accounting/admin/transactions`)
  await page.getByRole('button', { name: 'Record adjustment', exact: true }).click()
  const dialog = page.locator('dialog')
  await dialog.getByLabel('Shareholder').selectOption({ label: name })
  await dialog.getByLabel('Shares (use a minus sign to reduce)').fill('25')
  await dialog.getByLabel('Reason').fill('e2e reconcile 2019 import')
  await dialog.getByRole('button', { name: 'Record adjustment' }).click()

  // The form closes and the history now lists the adjustment.
  await expect(dialog).toHaveCount(0)
  const card = page.locator('.txcard').filter({ hasText: 'e2e reconcile 2019 import' })
  await expect(card).toHaveCount(1)
  await expect(card.getByText(`${name} +25`, { exact: true })).toBeVisible()
  await expect(card.getByText('Adjustment', { exact: true })).toBeVisible()
  await admin.close()
})
