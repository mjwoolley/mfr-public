// CAP-048 Member Feedback on a real deployed preview.
//
// e2e/tests/feedback.spec.ts drives the same panel, but against `next start` on
// a GitHub runner. This is the one place the Feedback button and panel run on
// Vercel's own infrastructure (real build, real edge/runtime, real session
// cookie) before merge — the class of break CI structurally cannot see.
//
// Jira is deliberately NOT configured for Preview (docs/member-feedback.md:
// secrets go on Production only, so testing can never create Tasks on the live
// board). Send therefore reaches the server and comes back with the
// "unavailable" error, which proves the client → route round-trip and that the
// member keeps their draft. If Preview-scoped Jira credentials are ever added
// (see docs/backlog.md), this spec must switch to asserting the success
// confirmation and delete the Task it created, the way upload.spec.ts deletes
// its blob.
//
// Read-mostly: the only write would be a Jira Task, and Preview cannot make one.

import { test, expect } from '@playwright/test'

const BASE = process.env.PREVIEW_URL
const TOKEN = process.env.SMOKE_SESSION_TOKEN

test.describe('preview: member feedback panel', () => {
  test.skip(!BASE || !TOKEN, 'PREVIEW_URL and SMOKE_SESSION_TOKEN are required')

  test('an approved member can open the panel, is told when Send is unavailable, and keeps the draft', async ({
    browser,
  }) => {
    const base = BASE as string
    const context = await browser.newContext({ baseURL: base })

    // Same cookie rule as upload.spec.ts: Auth.js uses the __Secure- prefix over
    // https. The preview's Neon branch is forked from production and inherits the
    // seeded smoke session row, so the prod token authenticates here.
    const isHttps = base.startsWith('https://')
    await context.addCookies([
      {
        name: isHttps ? '__Secure-authjs.session-token' : 'authjs.session-token',
        value: TOKEN as string,
        domain: new URL(base).hostname,
        path: '/',
        httpOnly: true,
        secure: isHttps,
        sameSite: 'Lax',
      },
    ])

    const page = await context.newPage()
    await page.goto('/')

    // Visible only to approved members; the smoke user is one.
    const button = page.getByRole('button', { name: 'Feedback', exact: true })
    await expect(button).toBeVisible()

    await button.click()
    const dialog = page.locator('dialog[open]')
    const message = dialog.getByRole('textbox')
    await expect(message).toBeFocused()

    // Client-side validation never leaves the browser.
    await dialog.getByRole('button', { name: 'Send' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Enter your feedback before sending.')

    const draft = `Preview smoke ${new Date().toISOString()} — safe to ignore`
    await message.fill(draft)
    await dialog.getByRole('button', { name: 'Send' }).click()

    // Jira is unset on Preview, so the route answers 503 and the panel says so
    // without losing the member's text.
    await expect(dialog.getByRole('alert')).toHaveText(
      'Feedback could not be sent right now. Please try again later.',
    )
    await expect(message).toHaveValue(draft)
    await expect(message).toBeEditable()

    // Escape closes the panel and hands focus back to the button.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(button).toBeFocused()

    await context.close()
  })
})
