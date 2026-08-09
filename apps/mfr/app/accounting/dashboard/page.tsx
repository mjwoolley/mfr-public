// Shareholder dashboard: share balance + ownership %, the current fiscal
// year's share-purchase-goal tracker (with Venmo QR when configured), and the
// shareholder's full entry history with approval/dispute states inline.

import QRCode from 'qrcode'
import { and, eq, gte, lt, desc, sql } from 'drizzle-orm'
import { requireShareholder } from '@/lib/accounting/authz'
import { db } from '@/lib/db/client'
import { shareholder as shareholderTable, transaction, ledgerEntry } from '@/lib/db/schema'
import { Decimal } from '@/lib/accounting/decimal'
import { getShareholderBalance, getTotalSharesOutstanding } from '@/lib/accounting/ledger'
import { getContributionGoal, computeGoalProgress } from '@/lib/accounting/goals'
import { currentFiscalYear, fiscalYearRange, fiscalYearLabel } from '@/lib/accounting/fiscalYear'
import { getVenmoConfig } from '@/lib/accounting/venmo'
import { formatShares, formatDate } from '@/lib/accounting/format'
import { transactionTypeTag, IN_KIND_TAG } from '@/lib/accounting/tags'
import { ApprovalStatus, TransactionType } from '@/lib/accounting/enums'
import { FiscalYearNote } from '@/components/accounting/FiscalYearNote'
import { VenmoDialogButton } from './venmo-dialog'
import { DisputeEntryActions } from './dispute-actions'

export default async function DashboardPage() {
  const session = await requireShareholder()
  const shareholderId = session.user.shareholderId
  const currentFY = currentFiscalYear()
  const { start: yearStart, end: nextYearStart } = fiscalYearRange(currentFY)

  // One parallel round-trip for everything on the page. "Raised this year"
  // sums contribution entries across ALL shareholders inside the current
  // fiscal-year range (Mar 1 → Mar 1, half-open) — it feeds the shared goal
  // tracker, not this shareholder's personal totals.
  const [shareholder, balance, total, entries, goal, raised] = await Promise.all([
    (async () => {
      const row = await db.query.shareholder.findFirst({
        where: eq(shareholderTable.id, shareholderId),
      })
      if (!row) throw new Error(`Shareholder ${shareholderId} not found`)
      return row
    })(),
    getShareholderBalance(shareholderId),
    getTotalSharesOutstanding(),
    // Ordered below by the *transaction's* date, not the ledger entry's: they
    // are written together, but the transaction's is the one every other view
    // and every fiscal-year figure uses, and it is the one a back-dated
    // purchase carries. Sorted in JS because Drizzle's relational query builder
    // can't order a findMany by a joined parent's column — this is one
    // shareholder's own history, so the list is small.
    db.query.ledgerEntry
      .findMany({
        where: eq(ledgerEntry.shareholderId, shareholderId),
        with: {
          transaction: {
            with: {
              approvals: { where: (t, { eq }) => eq(t.shareholderId, shareholderId) },
              correctsTransaction: { columns: { id: true, type: true } },
            },
          },
        },
      })
      .then((rows) =>
        rows.sort((a, b) => b.transaction.createdAt.getTime() - a.transaction.createdAt.getTime()),
      ),
    getContributionGoal(currentFY),
    (async () => {
      const [r] = await db
        .select({ sum: sql<string>`coalesce(sum(${ledgerEntry.shares}),0)` })
        .from(ledgerEntry)
        .innerJoin(transaction, eq(transaction.id, ledgerEntry.transactionId))
        .where(
          and(
            eq(transaction.type, TransactionType.CONTRIBUTION),
            gte(transaction.createdAt, yearStart),
            lt(transaction.createdAt, nextYearStart),
            eq(transaction.deleted, false),
          ),
        )
      return new Decimal(r.sum)
    })(),
  ])

  const ownershipPct = total.isZero() ? 0 : balance.div(total).mul(100).toNumber()
  const raisedThisYear = raised.toNumber()
  const goalAmount = goal ? Number(goal.amount) : null
  const progress = goalAmount ? computeGoalProgress(goalAmount, raisedThisYear) : null

  // QR is rendered server-side to a data URL — no client QR library, and the
  // Venmo link works even with JS disabled.
  const venmo = getVenmoConfig()
  const qrDataUrl = venmo ? await QRCode.toDataURL(venmo.url, { margin: 1, width: 420 }) : null

  return (
    <div>
      <div
        className="mb-1.5 text-[13px] font-bold tracking-[0.14em] uppercase"
        style={{ color: 'var(--color-accent-700)' }}
      >
        Welcome back
      </div>
      <h1 className="mb-5 text-4xl">{shareholder.name}</h1>

      {/* stat cards */}
      <div className="mb-8 flex flex-wrap gap-4">
        <div className="card elev-sm min-w-[240px] flex-1 bg-white px-6 py-6">
          <div className="text-muted text-xs tracking-[0.06em] uppercase">
            Shares currently owned
          </div>
          <div
            className="mt-2 text-[44px] leading-[1.05]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {formatShares(Number(balance))}
          </div>
          <div className="text-muted mt-1 text-[13px]">Each $1 contributed buys 1 share</div>
        </div>
        <div
          className="card elev-sm min-w-[240px] flex-1 px-6 py-6"
          style={{ background: 'var(--color-accent-2-100)' }}
        >
          <div
            className="text-xs tracking-[0.06em] uppercase"
            style={{ color: 'var(--color-accent-2-800)' }}
          >
            Your ownership
          </div>
          <div
            className="mt-2 text-[44px] leading-[1.05]"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-accent-2-800)' }}
          >
            {ownershipPct.toFixed(1)}%
          </div>
          <div className="mt-1 text-[13px]" style={{ color: 'var(--color-accent-2-800)' }}>
            of the lake house
          </div>
        </div>
      </div>

      {/* share purchase goal tracker */}
      {(progress || venmo) && (
        <div className="card elev-sm mb-8 bg-white px-6 py-5">
          <div className="mb-3 flex flex-wrap items-center gap-3.5">
            {goalAmount !== null ? (
              <div>
                <div className="text-muted text-xs tracking-[0.06em] uppercase">
                  {fiscalYearLabel(currentFY)} share purchase goal
                </div>
                <div className="mt-1 text-[26px]" style={{ fontFamily: 'var(--font-heading)' }}>
                  {formatShares(raisedThisYear)}{' '}
                  <span className="text-base" style={{ color: 'var(--color-neutral-600)' }}>
                    of {formatShares(goalAmount)} shares
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-muted text-sm">
                No share purchase goal set for {fiscalYearLabel(currentFY)} yet.
              </div>
            )}
            {venmo && qrDataUrl && (
              <VenmoDialogButton
                qrDataUrl={qrDataUrl}
                venmoUrl={venmo.url}
                venmoHandle={venmo.handle}
              />
            )}
          </div>
          {progress && (
            <>
              <div
                className="h-3.5 overflow-hidden rounded-full"
                style={{ background: 'var(--color-neutral-200)' }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-400 ease-out"
                  style={{ width: `${progress.pct}%`, background: 'var(--color-accent-2-500)' }}
                />
              </div>
              <div className="text-muted mt-2 text-[13px]">{progress.note}</div>
            </>
          )}
          <FiscalYearNote className="text-muted mt-3 mb-0 text-[13px]" />
        </div>
      )}

      <h2 className="mb-3.5 text-[22px]">Your share purchase history</h2>
      <div className="flex flex-col gap-3">
        {entries.map((e) => {
          const approval = e.transaction.approvals[0]
          const typeTag = transactionTypeTag(e.transaction.type)
          const shares = Number(e.shares)
          const deleted = e.transaction.deleted
          return (
            <div
              key={e.id}
              className={`card elev-sm px-5 py-4 ${deleted ? 'line-through opacity-60' : ''}`}
              style={{ gap: 8 }}
            >
              {deleted && (
                <div className="text-muted no-underline text-xs">
                  Corrected — excluded from your totals.
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <span className={typeTag.className}>{typeTag.label}</span>
                {e.transaction.inKind && (
                  <span className={`${IN_KIND_TAG.className} px-[7px] py-0 text-[10px]`}>
                    {IN_KIND_TAG.label}
                  </span>
                )}
                <span
                  className="ml-0.5 text-lg"
                  style={{
                    fontFamily: 'var(--font-heading)',
                    color: shares >= 0 ? 'var(--color-accent-2-800)' : 'var(--color-accent-800)',
                  }}
                >
                  {shares >= 0 ? '+' : ''}
                  {formatShares(e.shares.toString())}
                </span>
                <span className="text-muted ml-auto text-[13px]">
                  {formatDate(e.transaction.createdAt)}
                </span>
              </div>
              {e.transaction.description && (
                <div className="text-sm">{e.transaction.description}</div>
              )}
              {e.transaction.correctsTransaction && (
                <div className="text-muted text-xs">
                  Corrects {e.transaction.correctsTransaction.type} transaction #
                  {e.transaction.correctsTransaction.id.slice(-6)}
                </div>
              )}
              {approval && (
                <div>
                  <span
                    className={
                      approval.status === ApprovalStatus.CONFIRMED
                        ? 'tag tag-accent-2'
                        : approval.status === ApprovalStatus.DISPUTED
                          ? 'tag tag-accent'
                          : 'tag tag-outline'
                    }
                  >
                    {approval.status === ApprovalStatus.CONFIRMED
                      ? 'Approved'
                      : approval.status === ApprovalStatus.DISPUTED
                        ? 'Disputed'
                        : 'Pending your approval'}
                  </span>
                  {approval.status === ApprovalStatus.DISPUTED && (
                    <div
                      className="mt-1.5 rounded-2xl px-3.5 py-2.5 text-xs"
                      style={{
                        background: 'var(--color-accent-100)',
                        border: '1px solid var(--color-accent-300)',
                        color: 'var(--color-accent-900)',
                      }}
                    >
                      <p className="m-0">
                        <span className="font-semibold">Your dispute:</span>{' '}
                        {approval.disputeReason}
                      </p>
                      {approval.resolvedAt ? (
                        <p className="m-0 mt-1" style={{ color: 'var(--color-accent-700)' }}>
                          Resolved {formatDate(approval.resolvedAt)}
                          {approval.resolutionTransactionId &&
                            ` — correction #${approval.resolutionTransactionId.slice(-6)}`}
                        </p>
                      ) : (
                        <DisputeEntryActions
                          approvalId={approval.id}
                          disputeReason={approval.disputeReason}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {entries.length === 0 && <p className="text-muted">No share purchases yet.</p>}
      </div>
    </div>
  )
}
