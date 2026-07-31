import { describe, expect, it } from 'vitest'
import { render } from '@react-email/render'
import { NewSignupNotification } from './NewSignupNotification'

const props = {
  signupName: 'Michele Anderegg',
  signupEmail: 'michele@example.com',
  adminUrl: 'https://millerfamilyreunions.org/admin/users',
}

describe('NewSignupNotification', () => {
  it('names the person and their email', async () => {
    const html = await render(NewSignupNotification(props))

    expect(html).toContain('Michele Anderegg')
    expect(html).toContain('michele@example.com')
    expect(html).toContain('New signup awaiting approval')
  })

  it('links straight to User Management', async () => {
    const html = await render(NewSignupNotification(props))

    expect(html).toContain('href="https://millerfamilyreunions.org/admin/users"')
    expect(html).toContain('Review in User Management')
  })

  it('puts the bare URL near the top, before the prose, for the SMS gateway', async () => {
    // One recipient is a @vtext.net address: text only, truncated hard. The URL
    // has to survive that, so it must precede the explanatory sentences.
    const text = (await render(NewSignupNotification(props), { plainText: true })).trim()

    const urlAt = text.indexOf('https://millerfamilyreunions.org/admin/users')
    const proseAt = text.indexOf('No shareholder record matched')
    expect(urlAt).toBeGreaterThanOrEqual(0)
    expect(proseAt).toBeGreaterThanOrEqual(0)
    expect(urlAt).toBeLessThan(proseAt)
  })
})
