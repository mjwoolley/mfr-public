// Browser smoke tests for the accounting app: portal sign-in redirect, the
// pending-user gate, and the shareholder dashboard for a linked persona.

import { test, expect } from '@playwright/test'
import { ACCOUNTING_URL, WEB_URL } from '../../playwright.config'
import { contextFor } from '../session'

test.describe('accounting portal', () => {
  test('signed-out visitors are redirected to the portal sign-in', async ({ page }) => {
    await page.goto(`${ACCOUNTING_URL}/accounting`)

    // Sign-in is centralized on the portal; the gate redirects here with a
    // callbackUrl. Requires the accounting app to be built with
    // NEXT_PUBLIC_HOME_URL=<web url> so the redirect stays local in e2e.
    await expect(page).toHaveURL(new RegExp(`^${WEB_URL}/sign-in\\?callbackUrl=`))
  })

  test('pending users are held at the pending page', async ({ browser }) => {
    const context = await contextFor(browser, 'pending')
    const page = await context.newPage()

    await page.goto(`${ACCOUNTING_URL}/accounting`)

    await expect(page).toHaveURL(/\/accounting\/pending/)
    await context.close()
  })

  test('a linked shareholder lands on their dashboard', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()

    await page.goto(`${ACCOUNTING_URL}/accounting`)

    await expect(page).toHaveURL(/\/accounting\/dashboard/)
    await expect(page.getByRole('heading', { name: 'Your contribution history' })).toBeVisible()
    await context.close()
  })

  test('approved users with no shareholder or admin role are unauthorized', async ({ browser }) => {
    const context = await contextFor(browser, 'outsider')
    const page = await context.newPage()

    await page.goto(`${ACCOUNTING_URL}/accounting`)

    await expect(page).toHaveURL(/\/accounting\/unauthorized/)
    await expect(page.getByRole('heading', { name: 'Not authorized' })).toBeVisible()
    await context.close()
  })

  test('admins land on the activity view', async ({ browser }) => {
    const context = await contextFor(browser, 'admin')
    const page = await context.newPage()

    await page.goto(`${ACCOUNTING_URL}/accounting`)

    await expect(page).toHaveURL(/\/accounting\/admin\/activity/)
    await context.close()
  })
})
