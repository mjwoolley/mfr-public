// Share purchases tab (server half): full ledger grouped per shareholder and
// per fiscal year (contributionsGrouping.ts). Access follows the admin
// "visible to everyone" toggle — non-admins are redirected while it's off.

import { redirect } from 'next/navigation'
import { canAdminAccounting } from '@mfr/auth'
import { requireAuthorized } from '@/lib/accounting/authz'
import { db } from '@/lib/db/client'
import { getAllShareholderBalances } from '@/lib/accounting/ledger'
import { getAppSettings } from '@/lib/accounting/settings'
import { TransactionType } from '@/lib/accounting/enums'
import {
  contributionTotalsByYear,
  groupEntriesByShareholder,
  groupEntriesByYear,
  type ContributionEntryRow,
  type ShareholderBalanceRow,
} from './contributionsGrouping'
import { ContributionsClient } from './contributions-client'
import { FiscalYearNote } from '@/components/accounting/FiscalYearNote'
import { formatShares } from '@/lib/accounting/format'

export default async function ContributionsPage() {
  const session = await requireAuthorized()

  // Visibility gate: when the admin toggle is "Admins only", non-admin
  // shareholders don't get this tab (the nav already hides it; this covers
  // direct URLs). Send them somewhere they can actually use: their own
  // dashboard if they have one, otherwise the ownership report — which is
  // always visible, and is where an approved user with no Shareholder link
  // would otherwise dead-end.
  const settings = await getAppSettings()
  if (!settings.contributionsVisibleToAll && !canAdminAccounting(session.user.roles)) {
    redirect(session.user.shareholderId ? '/accounting/dashboard' : '/accounting/ownership')
  }

  const [entries, { rows: balanceRows, total }] = await Promise.all([
    db.query.ledgerEntry.findMany({
      with: { transaction: true, shareholder: true },
    }),
    getAllShareholderBalances(),
  ])

  const rows: ContributionEntryRow[] = entries.map((e) => ({
    shareholderId: e.shareholderId,
    shareholderName: e.shareholder.name,
    type: e.transaction.type,
    date: e.transaction.createdAt.toISOString(),
    description: e.transaction.description,
    amount: Number(e.shares),
    inKind: e.transaction.inKind,
    deleted: e.transaction.deleted,
  }))

  const balances: ShareholderBalanceRow[] = balanceRows.map((r) => ({
    shareholderId: r.shareholder.id,
    name: r.shareholder.name,
    balance: Number(r.shares),
    pct: Number(r.percent),
  }))

  const perShareholder = groupEntriesByShareholder(rows, balances)
  const perYear = groupEntriesByYear(rows)

  // Shares sold by year (share-purchase entries only).
  const totalsByYear = contributionTotalsByYear(rows)
  const years = [...totalsByYear.keys()].sort((a, b) => a - b)
  const maxYearTotal = Math.max(1, ...totalsByYear.values())

  const totalContrib = rows
    .filter((r) => r.type === TransactionType.CONTRIBUTION && !r.deleted)
    .reduce((sum, r) => sum + r.amount, 0)
  const adjTotal = rows
    .filter((r) => r.type === TransactionType.ADJUSTMENT && !r.deleted)
    .reduce((sum, r) => sum + r.amount, 0)

  const summary =
    years.length === 0
      ? 'No share purchases recorded yet.'
      : `${formatShares(totalContrib)} shares purchased since ${years[0]}, plus ${formatShares(adjTotal)} in reconciling adjustments — ${formatShares(Number(total))} shares outstanding today.`

  return (
    <div>
      <h1 className="mb-2 text-4xl">Share purchases</h1>
      <p className="text-muted mb-1.5 max-w-[70ch] text-[15px]">{summary}</p>
      <FiscalYearNote />

      {years.length > 0 && (
        <div className="card elev-sm mb-8 bg-white px-6 py-5">
          <h2 className="mb-1 text-xl">Shares sold by year</h2>
          <p className="text-muted mb-3 text-[13px]">
            Every dollar contributed buys one share. The founding year raised the down payment.
          </p>
          <div className="flex flex-col gap-[3px]">
            {years.map((year) => {
              const value = totalsByYear.get(year) ?? 0
              const w = Math.max(1, (value / maxYearTotal) * 100)
              return (
                <div
                  key={year}
                  className="flex items-center gap-2.5"
                  title={`${year} — ${formatShares(value)} shares`}
                >
                  <div className="text-muted w-[34px] flex-none text-right text-[11px] font-semibold">
                    {year}
                  </div>
                  <div className="flex-1">
                    <div
                      className="h-[10px]"
                      style={{
                        width: `${w}%`,
                        background: 'var(--color-accent-2-400)',
                        borderRadius: '0 3px 3px 0',
                      }}
                    />
                  </div>
                  <div
                    className="w-[70px] flex-none text-right text-[11px] font-bold"
                    style={{
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--color-accent-2-800)',
                    }}
                  >
                    {formatShares(value)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <ContributionsClient
        perShareholder={perShareholder}
        perYear={perYear}
        currentShareholderId={session.user.shareholderId ?? null}
      />
    </div>
  )
}
