// @vitest-environment happy-dom
// Requirement coverage for the admin share-transaction history and its record
// / correction forms (CAP-042, CAP-036, CAP-037). The server page runs for real
// over stubbed DB rows (so its row lines and approval labels are exercised) and
// its client half is rendered and clicked. The record actions are spies.
//
// History ORDER and the active-only shareholder list are decided by the DB
// query, so they're checked against the real DB in
// tests/accounting-integration/requirements-history.test.ts.
//
// Deliberately NOT asserted: the correction form's default amounts ("a full
// reversal") — CAP-036's open question says accepting them reverses the
// transaction twice.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const { db, actions } = vi.hoisted(() => ({
  db: {
    query: {
      transaction: { findMany: vi.fn() },
      shareholder: { findMany: vi.fn() },
    },
  },
  actions: {
    createContribution: vi.fn(),
    createTransfer: vi.fn(),
    createAdjustment: vi.fn(),
    createCorrection: vi.fn(),
  },
}))

vi.mock('@/lib/db/client', () => ({ db }))
vi.mock('@/actions/accounting/contributions', () => ({
  createContribution: actions.createContribution,
}))
vi.mock('@/actions/accounting/transfers', () => ({ createTransfer: actions.createTransfer }))
vi.mock('@/actions/accounting/adjustments', () => ({ createAdjustment: actions.createAdjustment }))
vi.mock('@/actions/accounting/corrections', () => ({ createCorrection: actions.createCorrection }))

import AdminTransactionsPage from './page'

const ANNA = { id: 'sh-anna', name: 'Anna Miller' }
const BEN = { id: 'sh-ben', name: 'Ben Miller' }

type Status = 'PENDING' | 'CONFIRMED' | 'DISPUTED'

function tx(opts: {
  id: string
  type: 'CONTRIBUTION' | 'TRANSFER' | 'ADJUSTMENT' | 'CORRECTION'
  date: string
  entries: { who: typeof ANNA; shares: string }[]
  approvals?: { who: typeof ANNA; status: Status }[]
  description?: string
  deleted?: boolean
  corrects?: { id: string; type: string }
}) {
  return {
    id: opts.id,
    type: opts.type,
    createdAt: new Date(`${opts.date}T12:00:00Z`),
    description: opts.description ?? null,
    inKind: false,
    deleted: opts.deleted ?? false,
    createdByName: 'Ada Admin',
    createdByEmail: 'admin@example.com',
    entries: opts.entries.map((e) => ({
      shareholderId: e.who.id,
      shares: e.shares,
      shareholder: { name: e.who.name },
    })),
    approvals: (opts.approvals ?? []).map((a) => ({
      shareholderId: a.who.id,
      status: a.status,
      shareholder: { name: a.who.name },
    })),
    correctsTransaction: opts.corrects ?? null,
  }
}

const TRANSFER = tx({
  id: 'tx-transfer-0000beef',
  type: 'TRANSFER',
  date: '2020-01-15',
  description: 'e2e transfer',
  entries: [
    { who: ANNA, shares: '-100' },
    { who: BEN, shares: '100' },
  ],
  approvals: [
    { who: ANNA, status: 'CONFIRMED' },
    { who: BEN, status: 'PENDING' },
  ],
})

async function renderPage(correct?: string) {
  render(await AdminTransactionsPage({ searchParams: Promise.resolve({ correct }) }))
}

/** History cards, top to bottom. */
function cards() {
  const list = screen.getByRole('heading', { name: 'History' }).nextElementSibling!
  return Array.from(list.querySelectorAll<HTMLElement>(':scope > div.txcard'))
}

function text(el: Element | null) {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function dateInput() {
  return screen.getByLabelText('Date') as HTMLInputElement
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  // Midday UTC, so "today" is the same calendar day in every US time zone
  // (CAP-037's open question on UTC vs local "today" stays out of this test).
  vi.setSystemTime(new Date('2026-09-26T12:00:00Z'))
  db.query.transaction.findMany.mockResolvedValue([TRANSFER])
  db.query.shareholder.findMany.mockResolvedValue([ANNA, BEN])
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CAP-042 Share transaction history', () => {
  it('CAP-042 · Recording starts from the history', async () => {
    actions.createAdjustment.mockResolvedValue({ success: true })
    await renderPage()

    for (const label of ['Record share purchase', 'Record transfer', 'Record adjustment']) {
      fireEvent.click(screen.getByRole('button', { name: label }))
      const dialog = document.querySelector('dialog')!
      expect(dialog.querySelector('.dialog-title')!.textContent).toBe(label)
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(document.querySelector('dialog')).toBeNull()
    }

    // Once the entry is recorded the form closes itself.
    fireEvent.click(screen.getByRole('button', { name: 'Record adjustment' }))
    const dialog = document.querySelector('dialog')!
    fireEvent.change(within(dialog).getByLabelText('Shareholder'), {
      target: { value: ANNA.id },
    })
    fireEvent.change(within(dialog).getByLabelText('Shares (use a minus sign to reduce)'), {
      target: { value: '25' },
    })
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'reconcile' } })
    fireEvent.submit(dialog.querySelector('form')!)

    await waitFor(() => expect(actions.createAdjustment).toHaveBeenCalledTimes(1))
    const posted = actions.createAdjustment.mock.calls[0][1] as FormData
    expect(posted.get('shareholderId')).toBe(ANNA.id)
    expect(posted.get('amount')).toBe('25')
    expect(posted.get('description')).toBe('reconcile')
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull())
  })

  it("CAP-042 · Each shareholder's approval state is shown", async () => {
    await renderPage()

    const [card] = cards()
    const labels = Array.from(card.querySelectorAll('span.tag')).map((t) => t.textContent)
    expect(labels).toEqual(['Transfer', 'Anna Miller · Confirmed', 'Ben Miller · Pending'])
  })

  it("CAP-042 · Corrected transactions are struck through and can't be corrected again", async () => {
    db.query.transaction.findMany.mockResolvedValue([
      tx({
        id: 'tx-correction-0000cafe',
        type: 'CORRECTION',
        date: '2026-05-01',
        description: 'fix amount',
        entries: [{ who: ANNA, shares: '60' }],
        corrects: { id: 'tx-original-00001234', type: 'CONTRIBUTION' },
      }),
      tx({
        id: 'tx-original-00001234',
        type: 'CONTRIBUTION',
        date: '2026-05-01',
        deleted: true,
        entries: [{ who: ANNA, shares: '100' }],
      }),
    ])

    await renderPage()

    const [correction, original] = cards()
    const line = within(original).getByText('Anna Miller +100')
    expect(line.className).toContain('line-through')
    expect(within(original).getByText('Corrected')).toBeTruthy()
    expect(within(original).queryByRole('button', { name: 'Correct' })).toBeNull()

    expect(text(correction)).toContain('· Corrects CONTRIBUTION #1234')
    expect(within(correction).getByRole('button', { name: 'Correct' })).toBeTruthy()
  })

  it('CAP-042 · Empty history', async () => {
    db.query.transaction.findMany.mockResolvedValue([])

    await renderPage()

    expect(cards()).toHaveLength(0)
    expect(screen.getByText('No transactions yet.')).toBeTruthy()
  })
})

describe('CAP-036 Transaction corrections — the form', () => {
  it('CAP-036 · The correction form explains what will happen', async () => {
    await renderPage()
    fireEvent.click(within(cards()[0]).getByRole('button', { name: 'Correct' }))

    const dialog = document.querySelector('dialog')!
    expect(text(dialog.querySelector('p'))).toContain(
      'the original will be marked corrected (shown struck through, excluded from totals)',
    )
    const amountLabels = Array.from(dialog.querySelectorAll('label'))
      .map((l) => text(l))
      .filter((l) => l.startsWith('Correction (shares)'))
    expect(amountLabels).toEqual([
      'Correction (shares) for Anna Miller — originally -100',
      'Correction (shares) for Ben Miller — originally +100',
    ])
    expect((within(dialog).getByLabelText('Description') as HTMLInputElement).required).toBe(true)
  })

  it('CAP-036 · A corrected transaction cannot be corrected again from its history row', async () => {
    db.query.transaction.findMany.mockResolvedValue([{ ...TRANSFER, deleted: true }])

    await renderPage()

    const [card] = cards()
    expect(within(card).getByText('Corrected')).toBeTruthy()
    expect(within(card).queryByRole('button', { name: 'Correct' })).toBeNull()
  })

  it("CAP-036 · The correction keeps the original's fiscal year by default", async () => {
    await renderPage()
    fireEvent.click(within(cards()[0]).getByRole('button', { name: 'Correct' }))

    expect(dateInput().value).toBe('2020-01-15')
    expect(screen.getByText('Lands in FY2019 (Mar 2019 – Feb 2020)')).toBeTruthy()
  })

  it("CAP-036 · An admin can go straight to a disputed entry's correction (?correct= opens it)", async () => {
    await renderPage(TRANSFER.id)

    const dialog = document.querySelector('dialog')!
    expect(dialog.querySelector('.dialog-title')!.textContent).toBe('Record correction')
    expect(
      (dialog.querySelector('input[name="originalTransactionId"]') as HTMLInputElement).value,
    ).toBe(TRANSFER.id)
  })
})

describe('CAP-037 Transaction dates and fiscal year — the forms', () => {
  it.each(['Record share purchase', 'Record transfer', 'Record adjustment'])(
    'CAP-037 · Share transactions default to today (%s)',
    async (button) => {
      await renderPage()
      fireEvent.click(screen.getByRole('button', { name: button }))

      expect(dateInput().value).toBe('2026-09-26')
      expect(screen.getByText('Lands in FY2026 (Mar 2026 – Feb 2027)')).toBeTruthy()
    },
  )

  it('CAP-037 · The form says which fiscal year a date lands in', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Record share purchase' }))

    fireEvent.change(dateInput(), { target: { value: '2025-01-15' } })

    expect(screen.getByText('Lands in FY2024 (Mar 2024 – Feb 2025)')).toBeTruthy()
  })
})
