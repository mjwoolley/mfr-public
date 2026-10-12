import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// Requirements coverage for CAP-043 (requirements/accounting/accounting-activity-log.md).
// Renders the admin Activity page against mocked DB rows so the card text is
// asserted exactly as the admin reads it.

const { txFindMany, expenseFindMany } = vi.hoisted(() => ({
  txFindMany: vi.fn(),
  expenseFindMany: vi.fn(),
}))

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      transaction: { findMany: txFindMany },
      expense: { findMany: expenseFindMany },
    },
  },
}))
// The resolve control's server action is never invoked by a static render.
vi.mock('@/actions/accounting/approvals', () => ({ resolveDispute: vi.fn() }))

import AdminActivityPage from './page'

type Approval = {
  id: string
  status: 'PENDING' | 'CONFIRMED' | 'DISPUTED'
  disputeReason?: string | null
  resolvedAt?: Date | null
  resolutionTransactionId?: string | null
  shareholder: { name: string }
}

function tx(over: Record<string, unknown> = {}) {
  return {
    id: 'tx-000000000001',
    type: 'CONTRIBUTION',
    description: null,
    inKind: false,
    deleted: false,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    enteredAt: new Date('2026-09-01T15:00:00Z'),
    createdByName: 'Pat Miller',
    createdByEmail: 'pat@family.org',
    entries: [{ shares: '100', shareholder: { name: 'Ann Miller' } }],
    approvals: [] as Approval[],
    correctsTransaction: null,
    ...over,
  }
}

function exp(over: Record<string, unknown> = {}) {
  return {
    id: 'exp-1',
    description: 'County property tax',
    amount: '1250.00',
    category: 'TAXES',
    capital: true,
    incurredAt: new Date('2026-09-01T12:00:00Z'),
    createdAt: new Date('2026-09-02T15:00:00Z'),
    createdByName: 'Pat Miller',
    createdByEmail: 'pat@family.org',
    ...over,
  }
}

async function render(transactions: unknown[], expenses: unknown[]) {
  txFindMany.mockResolvedValue(transactions)
  expenseFindMany.mockResolvedValue(expenses)
  return renderToStaticMarkup(await AdminActivityPage())
}

/** The markup with tags stripped and whitespace collapsed — what a reader sees. */
function text(html: string) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CAP-043 Accounting activity log — page', () => {
  it('CAP-043 · Share transactions and expenses appear together in one log', async () => {
    const html = await render([tx()], [exp()])
    const t = text(html)

    expect(t).toContain('Share purchase')
    expect(t).toContain('Ann Miller +100')
    expect(t).toContain('Expense · Taxes')
    expect(t).toContain('County property tax')
    expect(t).toContain(
      "Every transaction on the ledger — with each shareholder's confirmation status and any open disputes — alongside every recorded expense, in the order entries were made.",
    )
  })

  it('CAP-043 · The log is ordered by when each entry was made, not by its date', async () => {
    // Expense entered yesterday, dated last week; purchase entered today, back-dated to last year.
    const html = await render(
      [
        tx({
          createdAt: new Date('2025-09-20T12:00:00Z'),
          enteredAt: new Date('2026-09-26T10:00:00Z'),
        }),
      ],
      [
        exp({
          incurredAt: new Date('2026-09-18T12:00:00Z'),
          createdAt: new Date('2026-09-25T10:00:00Z'),
        }),
      ],
    )
    const t = text(html)

    expect(t.indexOf('Share purchase')).toBeLessThan(t.indexOf('Expense · Taxes'))
    expect(t).toContain('Dated Sep 20, 2025 · Recorded by Pat Miller')
    expect(t).toContain('Dated Sep 18, 2026 · Recorded by Pat Miller')
  })

  it('CAP-043 · An expense card shows what was spent and who recorded it', async () => {
    const html = await render([], [exp()])
    const t = text(html)

    expect(t).toContain('Expense · Taxes')
    expect(html).toMatch(/<span class="tag tag-outline[^"]*">Capital<\/span>/)
    expect(t).toContain('$1,250')
    expect(t).toContain('County property tax')
    expect(t).toContain('Dated Sep 1, 2026 · Recorded by Pat Miller')
  })

  it.each([
    ['Pat Miller', 'pat@family.org', 'Pat Miller'],
    [null, 'pat@family.org', 'pat@family.org'],
    [null, null, 'an admin'],
  ])(
    'CAP-043 · Who recorded an entry falls back when details are missing (name %s, email %s → %s)',
    async (name, email, shown) => {
      const html = await render(
        [tx({ createdByName: name, createdByEmail: email })],
        [exp({ createdByName: name, createdByEmail: email })],
      )
      const t = text(html)

      // Both the transaction card and the expense card end with the same line.
      const line = `Recorded by ${shown}`
      expect(t.split(line).length - 1).toBe(2)
    },
  )

  it("CAP-043 · A transaction card shows each shareholder's share movement", async () => {
    const html = await render(
      [
        tx({
          type: 'TRANSFER',
          entries: [
            { shares: '-100', shareholder: { name: 'Ann Miller' } },
            { shares: '100', shareholder: { name: 'Bob Miller' } },
          ],
        }),
      ],
      [],
    )
    const t = text(html)

    expect(html).toContain('>Transfer</span>')
    expect(html).toContain('>Ann Miller -100 · Bob Miller +100</div>')
    expect(t).toContain('Ann Miller -100 · Bob Miller +100')
  })

  it('CAP-043 · An in-kind share purchase is marked as such', async () => {
    const html = await render([tx({ inKind: true })], [])

    expect(html).toMatch(
      /<span class="tag tag-accent-2">Share purchase<\/span><span class="tag tag-outline[^"]*">In kind<\/span>/,
    )
  })

  it("CAP-043 · Each shareholder's confirmation status is shown on the card", async () => {
    const html = await render(
      [
        tx({
          type: 'TRANSFER',
          approvals: [
            { id: 'a1', status: 'CONFIRMED', shareholder: { name: 'Ann Miller' } },
            { id: 'a2', status: 'PENDING', shareholder: { name: 'Bob Miller' } },
          ],
        }),
      ],
      [],
    )
    const t = text(html)

    expect(t).toContain('Ann Miller · Confirmed')
    expect(t).toContain('Bob Miller · Pending')
  })

  it('CAP-043 · An open dispute is shown with ways to act on it', async () => {
    const html = await render(
      [
        tx({
          id: 'tx-disputed-abc123',
          approvals: [
            {
              id: 'a2',
              status: 'DISPUTED',
              disputeReason: 'I paid 200, not 100',
              resolvedAt: null,
              shareholder: { name: 'Bob Miller' },
            },
          ],
        }),
      ],
      [],
    )
    const t = text(html)

    expect(t).toContain('Bob Miller · Disputed')
    expect(t).not.toContain('Disputed (resolved)')
    expect(t).toContain('Bob Miller disputed: I paid 200, not 100')
    expect(html).toMatch(
      /<a[^>]*href="\/accounting\/admin\/transactions\?correct=tx-disputed-abc123"[^>]*>Issue correction<\/a>/,
    )
    expect(html).toMatch(/<button[^>]*>Mark resolved<\/button>/)
  })

  it('CAP-043 · A resolved dispute stays visible on the card', async () => {
    const html = await render(
      [
        tx({
          approvals: [
            {
              id: 'a2',
              status: 'DISPUTED',
              disputeReason: 'I paid 200, not 100',
              resolvedAt: new Date('2026-09-03T12:00:00Z'),
              resolutionTransactionId: 'correction-00fed321',
              shareholder: { name: 'Bob Miller' },
            },
          ],
        }),
      ],
      [],
    )
    const t = text(html)

    expect(t).toContain('Bob Miller · Disputed (resolved)')
    expect(t).toContain('Bob Miller disputed: I paid 200, not 100')
    expect(t).toContain('Resolved Sep 3, 2026 — correction #fed321')
    // Once resolved, the card no longer offers the actions.
    expect(t).not.toContain('Issue correction')
    expect(t).not.toContain('Mark resolved')
  })

  it('CAP-043 · A live transaction can be corrected from the log', async () => {
    const html = await render([tx({ id: 'tx-live-999' })], [])

    expect(html).toMatch(
      /<a[^>]*href="\/accounting\/admin\/transactions\?correct=tx-live-999"[^>]*>Correct<\/a>/,
    )
  })

  it("CAP-043 · A corrected transaction is struck through and can't be corrected again", async () => {
    const html = await render([tx({ id: 'tx-old-111', deleted: true })], [])

    expect(html).toMatch(/<span class="tag tag-outline[^"]*">Corrected<\/span>/)
    expect(html).toMatch(/<div class="[^"]*line-through[^"]*">Ann Miller \+100<\/div>/)
    expect(html).not.toContain('?correct=tx-old-111')
    expect(html).not.toMatch(/>Correct<\/a>/)
  })

  it('CAP-043 · A correction points back to the entry it corrects', async () => {
    const html = await render(
      [
        tx({
          type: 'CORRECTION',
          description: null,
          correctsTransaction: { id: 'transfer-0a1b2c3', type: 'TRANSFER' },
        }),
      ],
      [],
    )
    const t = text(html)

    expect(html).toContain('>Correction</span>')
    // Only the short id is asserted: how the corrected entry's type is worded
    // is an open question on CAP-043.
    expect(t).toMatch(/Corrects .*#a1b2c3/)
  })

  it('CAP-043 · The log with nothing in it', async () => {
    const html = await render([], [])

    expect(html).toContain('<p class="text-muted">No activity yet.</p>')
  })

  it('CAP-043 · The log is not empty-stated when there are entries', async () => {
    const html = await render([], [exp()])

    expect(html).not.toContain('No activity yet.')
  })
})
