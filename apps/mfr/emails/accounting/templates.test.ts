import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { render } from '@react-email/render'
import { ContributionNotification } from './ContributionNotification'
import { AdjustmentNotification } from './AdjustmentNotification'
import { TransferNotification } from './TransferNotification'
import { CorrectionNotification } from './CorrectionNotification'

describe('accounting email templates', () => {
  it('ContributionNotification shows name, shares, date, admin, inbox link', async () => {
    const html = await render(
      createElement(ContributionNotification, {
        shareholderName: 'Dana Brown',
        shares: '500',
        date: 'July 1, 2026',
        adminName: 'Mike Admin',
        inboxUrl: 'https://acct.example/inbox',
      }),
    )
    expect(html).toContain('Dana Brown')
    expect(html).toContain('500 shares')
    expect(html).toContain('Share purchase recorded')
    expect(html).toContain('July 1, 2026')
    expect(html).toContain('Mike Admin')
    expect(html).toContain('https://acct.example/inbox')
  })

  it('ContributionNotification states share purchases as counts, not dollars', async () => {
    const html = await render(
      createElement(ContributionNotification, {
        shareholderName: 'Dana Brown',
        shares: '500',
        date: 'July 1, 2026',
        adminName: 'Mike Admin',
        inboxUrl: 'https://acct.example/inbox',
      }),
    )
    expect(html).not.toContain('$500')
  })

  // In kind is exactly the case where the recipient needs to see WHAT came in,
  // so the description is surfaced rather than omitted as it is for cash.
  it('ContributionNotification flags an in-kind purchase and shows what was contributed', async () => {
    const html = await render(
      createElement(ContributionNotification, {
        shareholderName: 'Dana Brown',
        shares: '500',
        date: 'July 1, 2026',
        adminName: 'Mike Admin',
        inboxUrl: 'https://acct.example/inbox',
        inKind: true,
        description: 'deck lumber and two days of labour',
      }),
    )
    expect(html).toContain('In kind')
    expect(html).toContain('deck lumber and two days of labour')
  })

  it('ContributionNotification says nothing about in kind for a cash purchase', async () => {
    const html = await render(
      createElement(ContributionNotification, {
        shareholderName: 'Dana Brown',
        shares: '500',
        date: 'July 1, 2026',
        adminName: 'Mike Admin',
        inboxUrl: 'https://acct.example/inbox',
        inKind: false,
        description: 'cheque #1041',
      }),
    )
    expect(html).not.toContain('In kind')
  })

  it('AdjustmentNotification shows amount, reason, inbox link', async () => {
    const html = await render(
      createElement(AdjustmentNotification, {
        shareholderName: 'Dana Brown',
        amount: '12.50',
        description: 'correcting a rounding error',
        date: 'July 1, 2026',
        adminName: 'Mike Admin',
        inboxUrl: 'https://acct.example/inbox',
      }),
    )
    expect(html).toContain('Dana Brown')
    expect(html).toContain('12.50')
    expect(html).toContain('correcting a rounding error')
    expect(html).toContain('https://acct.example/inbox')
  })

  it("TransferNotification shows 'sent' direction wording", async () => {
    const html = await render(
      createElement(TransferNotification, {
        recipientName: 'Dana Brown',
        direction: 'sent',
        counterpartyName: 'Sam Lee',
        amount: '42.00',
        description: 'a gift of shares',
        date: 'July 1, 2026',
        adminName: 'Mike Admin',
        inboxUrl: 'https://acct.example/inbox',
      }),
    )
    expect(html).toContain('from you to Sam Lee')
    expect(html).toContain('42.00')
    expect(html).toContain('a gift of shares')
  })

  it("TransferNotification shows 'received' direction wording", async () => {
    const html = await render(
      createElement(TransferNotification, {
        recipientName: 'Sam Lee',
        direction: 'received',
        counterpartyName: 'Dana Brown',
        amount: '42.00',
        description: 'a gift of shares',
        date: 'July 1, 2026',
        adminName: 'Mike Admin',
        inboxUrl: 'https://acct.example/inbox',
      }),
    )
    expect(html).toContain('from Dana Brown to you')
  })

  it('CorrectionNotification shows the corrected original type and reason', async () => {
    const html = await render(
      createElement(CorrectionNotification, {
        shareholderName: 'Dana Brown',
        amount: '7.00',
        description: 'entered the wrong amount',
        originalType: 'CONTRIBUTION',
        date: 'July 1, 2026',
        adminName: 'Mike Admin',
        inboxUrl: 'https://acct.example/inbox',
      }),
    )
    expect(html).toContain('Dana Brown')
    expect(html).toContain('entered the wrong amount')
    expect(html).toContain('contribution')
  })
})
