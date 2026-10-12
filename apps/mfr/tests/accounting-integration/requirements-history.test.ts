// Requirement coverage, against the real test DB, for the parts of the admin
// share-transaction history that its DB query decides (CAP-042): the order of
// the list and which shareholders the record forms offer. The page is called
// directly and the props it hands its client half are inspected, filtered to
// this file's own fixtures (other suites share the DB).
import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/email', () => ({ sendEmail: vi.fn(), appUrl: (p: string) => p }))

import { auth } from '@/lib/auth'
import { adminSession, fd, makeShareholder, cleanupFixtures, daysAgo } from './requirementsFixtures'
import { createContribution } from '@/actions/accounting/contributions'
import { createTransfer } from '@/actions/accounting/transfers'
import AdminTransactionsPage from '@/app/accounting/admin/transactions/page'
import type { TxRow } from '@/app/accounting/admin/transactions/transactions-client'
import { formatDate } from '@/lib/accounting/format'

afterEach(async () => {
  vi.mocked(auth).mockReset()
  await cleanupFixtures()
})

async function pageProps() {
  const el = await AdminTransactionsPage({ searchParams: Promise.resolve({}) })
  return el.props as { rows: TxRow[]; shareholders: { id: string; name: string }[] }
}

function noonUtc(date: string) {
  return new Date(`${date}T12:00:00Z`)
}

describe('CAP-042 Share transaction history', () => {
  it('CAP-042 · Every transaction is listed, newest date first', async () => {
    const anna = await makeShareholder('Anna Miller')
    const ben = await makeShareholder('Ben Miller')
    vi.mocked(auth).mockResolvedValue(adminSession())
    const lastWeek = daysAgo(7)
    const yesterday = daysAgo(2)

    // The older purchase is keyed in last, so business-date order and entry
    // order disagree: only the former puts the transfer on top.
    await createTransfer(
      undefined,
      fd({
        fromShareholderId: anna.id,
        toShareholderId: ben.id,
        amount: '100',
        description: 'recent transfer',
        date: yesterday,
      }),
    )
    await createContribution(
      undefined,
      fd({
        shareholderId: anna.id,
        amount: '250',
        description: 'last week purchase',
        date: lastWeek,
      }),
    )

    const mine = (await pageProps()).rows.filter((r) =>
      r.entries.some((e) => e.shareholderId === anna.id),
    )
    expect(
      mine.map(({ typeLabel, dateFmt, description }) => ({ typeLabel, dateFmt, description })),
    ).toEqual([
      {
        typeLabel: 'Transfer',
        dateFmt: formatDate(noonUtc(yesterday)),
        description: 'recent transfer',
      },
      {
        typeLabel: 'Share purchase',
        dateFmt: formatDate(noonUtc(lastWeek)),
        description: 'last week purchase',
      },
    ])
  })

  it('CAP-042 · Only active shareholders can be chosen in the forms', async () => {
    const active = await makeShareholder('Active Miller')
    const gone = await makeShareholder('Gone Miller', { active: false })

    const ids = (await pageProps()).shareholders.map((s) => s.id)

    expect(ids).toContain(active.id)
    expect(ids).not.toContain(gone.id)
  })
})
