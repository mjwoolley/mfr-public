// CAP-048 Member Feedback: the floating button and panel in a real browser.
// Jira is not configured for e2e, so Send exercises the failure path; the
// Jira, email and callback contracts are covered by the route requirements
// tests (apps/mfr/app/api/feedback/feedback.requirements.test.ts).

import { test, expect } from '@playwright/test'
import { WEB_URL } from '../../playwright.config'
import { contextFor } from '../session'

test.describe('member feedback', () => {
  test('approved members can open, use and close the Feedback panel', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.goto(`${WEB_URL}/reservations`)

    const button = page.getByRole('button', { name: 'Feedback' })
    await expect(button).toBeVisible()
    const box = await button.boundingBox()
    const viewport = page.viewportSize()!
    expect(box!.x + box!.width).toBeGreaterThan(viewport.width - 40)
    expect(box!.y + box!.height).toBeGreaterThan(viewport.height - 40)

    await button.click()
    const dialog = page.locator('dialog[open]')
    const message = dialog.getByRole('textbox')
    await expect(message).toBeFocused()

    await dialog.getByRole('button', { name: 'Send' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Enter your feedback before sending.')

    await message.fill('Draft that should survive closing')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(button).toBeFocused()

    await button.click()
    await expect(message).toHaveValue('Draft that should survive closing')

    await dialog.getByRole('button', { name: 'Send' }).click()
    await expect(dialog.getByRole('alert')).toHaveText(
      'Feedback could not be sent right now. Please try again later.',
    )
    await expect(message).toHaveValue('Draft that should survive closing')
    await context.close()
  })

  test('the button is a compact icon on a phone', async ({ browser }) => {
    const context = await contextFor(browser, 'member')
    const page = await context.newPage()
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(WEB_URL)
    const button = page.getByRole('button', { name: 'Feedback' })
    await expect(button).toBeVisible()
    await expect(button.getByText('Feedback')).toBeHidden()
    await context.close()
  })

  for (const persona of ['pending', 'blocked'] as const) {
    test(`a ${persona} account sees no Feedback button`, async ({ browser }) => {
      const context = await contextFor(browser, persona)
      const page = await context.newPage()
      await page.goto(WEB_URL)
      await expect(page.getByRole('button', { name: 'Feedback' })).toHaveCount(0)
      await context.close()
    })
  }

  test('signed-out visitors see no Feedback button', async ({ page }) => {
    await page.goto(WEB_URL)
    await expect(page.getByRole('button', { name: 'Feedback' })).toHaveCount(0)
  })
})
