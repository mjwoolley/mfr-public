// Requirement coverage for the ledger email templates (CAP-039): the inbox
// link, the reply footer and the in-kind sentence. Subjects, recipients and
// reply-to are set by the actions — see
// tests/accounting-integration/requirements-emails.test.ts.
//
// Deliberately NOT asserted: the amount wording in the transfer, adjustment and
// correction bodies — CAP-039's open question notes they say "shares shares".
import { describe, it, expect } from 'vitest'
import { createElement, type ReactElement } from 'react'
import { render } from '@react-email/render'
import { ContributionNotification } from './ContributionNotification'
import { AdjustmentNotification } from './AdjustmentNotification'
import { TransferNotification } from './TransferNotification'
import { CorrectionNotification } from './CorrectionNotification'

const INBOX = 'https://acct.example/accounting/inbox'

const TEMPLATES: [string, ReactElement][] = [
  [
    'share purchase',
    createElement(ContributionNotification, {
      shareholderName: 'Dana Brown',
      shares: '500',
      date: 'July 1, 2026',
      adminName: 'Ada Admin',
      inboxUrl: INBOX,
    }),
  ],
  [
    'transfer',
    createElement(TransferNotification, {
      recipientName: 'Dana Brown',
      direction: 'sent',
      counterpartyName: 'Sam Lee',
      amount: '10 shares',
      description: 'gift',
      date: 'July 1, 2026',
      adminName: 'Ada Admin',
      inboxUrl: INBOX,
    }),
  ],
  [
    'adjustment',
    createElement(AdjustmentNotification, {
      shareholderName: 'Dana Brown',
      amount: '25 shares',
      description: 'reconcile 2019 import',
      date: 'July 1, 2026',
      adminName: 'Ada Admin',
      inboxUrl: INBOX,
    }),
  ],
  [
    'correction',
    createElement(CorrectionNotification, {
      shareholderName: 'Dana Brown',
      amount: '-90 shares',
      description: 'amount keyed twice',
      originalType: 'CONTRIBUTION',
      date: 'July 1, 2026',
      adminName: 'Ada Admin',
      inboxUrl: INBOX,
    }),
  ],
]

/** Visible text of an email, tags stripped and entities decoded. */
function visibleText(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('CAP-039 Ledger email notifications — templates', () => {
  it.each(TEMPLATES)(
    'CAP-039 · A share purchase is emailed to the shareholder — inbox link (%s email)',
    async (_kind, element) => {
      const html = await render(element)
      const link = html.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
      expect(link?.[1]).toBe(INBOX)
      expect(visibleText(link![2])).toBe('Review and acknowledge in your inbox')
    },
  )

  it.each(TEMPLATES)(
    'CAP-039 · Replies go to the admin who recorded the entry — reply footer (%s email)',
    async (_kind, element) => {
      const text = visibleText(await render(element))
      expect(text.endsWith("If this doesn't look right, just reply to this email.")).toBe(true)
    },
  )

  it('CAP-039 · An in-kind purchase email says what was contributed', async () => {
    const text = visibleText(
      await render(
        createElement(ContributionNotification, {
          shareholderName: 'Dana Brown',
          shares: '40',
          date: 'July 1, 2026',
          adminName: 'Ada Admin',
          inboxUrl: INBOX,
          inKind: true,
          description: 'deck lumber and two days of labour',
        }),
      ),
    )
    expect(text).toContain(
      'In kind — goods or services rather than cash. deck lumber and two days of labour',
    )
  })

  it.each([
    ['adjustment', TEMPLATES[2][1], 'reconcile 2019 import'],
    ['correction', TEMPLATES[3][1], 'amount keyed twice'],
  ])(
    'CAP-039 · Adjustments and corrections are emailed with their reason (%s)',
    async (_kind, element, reason) => {
      const text = visibleText(await render(element))
      expect(text).toContain(reason)
    },
  )
})
