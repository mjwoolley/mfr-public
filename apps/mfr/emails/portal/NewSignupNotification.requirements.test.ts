// Requirement coverage for CAP-002 New sign-up handling
// (requirements/accounts/new-sign-up-handling.md): the alert's wording.
import { describe, expect, it } from 'vitest'
import { render } from '@react-email/render'
import { NewSignupNotification } from './NewSignupNotification'

const ADMIN_URL = 'https://millerfamilyreunions.org/admin/users'

async function plainText() {
  const text = await render(
    NewSignupNotification({
      signupName: 'Ann Miller',
      signupEmail: 'ann@example.com',
      adminUrl: ADMIN_URL,
    }),
    { plainText: true },
  )
  // The plain-text renderer wraps long lines; compare sentences on one line.
  return text.replace(/\s+/g, ' ').trim()
}

describe('CAP-002 New sign-up handling', () => {
  it('CAP-002 · The alert gets an admin to the approval screen in one tap', async () => {
    const text = await plainText()

    const urlAt = text.indexOf(ADMIN_URL)
    const sentence =
      'No shareholder record matched their email, so they are waiting for an admin to approve them.'
    expect(urlAt).toBeGreaterThanOrEqual(0)
    expect(text).toContain(sentence)
    // The link comes before any of the prose (the SMS gateway truncates).
    expect(urlAt).toBeLessThan(text.indexOf('Ann Miller (ann@example.com)'))
    expect(urlAt).toBeLessThan(text.indexOf(sentence))
    // The reminder to tie them to a shareholder record from Accounting.
    expect(text).toContain(
      'If they should also be tied to a shareholder record, link them from Accounting → Admin → Shareholders.',
    )
  })
})
