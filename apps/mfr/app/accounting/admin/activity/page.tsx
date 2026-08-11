import Link from 'next/link'
import { desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { expense } from '@/lib/db/schema'
import { signedShares, formatUSD0, formatDate } from '@/lib/accounting/format'
import {
  transactionTypeTag,
  expenseCategoryTag,
  approvalStatusTag,
  IN_KIND_TAG,
} from '@/lib/accounting/tags'
import { ApprovalStatus } from '@/lib/accounting/enums'
import { mergeActivityFeed } from '@/lib/accounting/activityFeed'
import { LocalDateTime } from './LocalDateTime'
import { ResolveDisputeForm } from './resolve-dispute-form'

/**
 * The full activity feed: every ledger transaction (with the
 * dispute-resolution workflow) interleaved with every house expense, ordered
 * by when each entry was put into the system (an audit log — the business
 * date is data on the card, not the sort key). Formerly the top-level
 * /accounting/activity tab; folded into Admin in the Organic redesign (the
 * Contributions tab now gives shareholders their transparency view). The
 * admin layout's requireAdmin() gates this.
 */
export default async function AdminActivityPage() {
  const [transactions, expenses] = await Promise.all([
    db.query.transaction.findMany({
      orderBy: (t) => [desc(t.enteredAt)],
      with: {
        entries: { with: { shareholder: { columns: { name: true } } } },
        approvals: { with: { shareholder: { columns: { name: true } } } },
        correctsTransaction: { columns: { id: true, type: true } },
      },
    }),
    db.query.expense.findMany({ orderBy: [desc(expense.createdAt)] }),
  ])
  const feed = mergeActivityFeed(transactions, expenses)

  return (
    <div>
      <p className="text-muted mb-4 text-sm">
        Every transaction on the ledger — with each shareholder&apos;s confirmation status and any
        open disputes — alongside every recorded expense, in the order entries were made.
      </p>

      <div className="flex flex-col gap-2">
        {feed.map((item) => {
          if (item.kind === 'expense') {
            const x = item.expense
            const categoryTag = expenseCategoryTag(x.category)
            return (
              <div
                key={x.id}
                className="card elev-sm px-4 py-3 text-[13px] sm:text-sm"
                style={{ gap: 5 }}
              >
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className={`${categoryTag.className} flex-none`}>
                    Expense · {categoryTag.label}
                  </span>
                  {x.capital && (
                    <span className="tag tag-outline flex-none px-[7px] py-0 text-[10px]">
                      Capital
                    </span>
                  )}
                  <span className="min-w-0 text-[13px] font-semibold sm:text-sm">
                    {formatUSD0(x.amount)}
                  </span>
                  <span className="text-muted ml-auto flex-none text-[11px] whitespace-nowrap sm:text-xs">
                    <LocalDateTime iso={x.createdAt.toISOString()} />
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted text-[11px] sm:text-xs">{x.description}</span>
                </div>
                <div className="text-muted text-[11px] sm:text-xs">
                  Dated {formatDate(x.incurredAt)} · Recorded by{' '}
                  {x.createdByName ?? x.createdByEmail ?? 'an admin'}
                </div>
              </div>
            )
          }
          const t = item.transaction
          const typeTag = transactionTypeTag(t.type)
          const entryLine = t.entries
            .map((e) => `${e.shareholder.name} ${signedShares(e.shares.toString())}`)
            .join(' · ')
          const disputedApprovals = t.approvals.filter((a) => a.status === ApprovalStatus.DISPUTED)
          return (
            <div
              key={t.id}
              className="card elev-sm px-4 py-3 text-[13px] sm:text-sm"
              style={{ gap: 5 }}
            >
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className={`${typeTag.className} flex-none`}>{typeTag.label}</span>
                {t.inKind && (
                  <span className={`${IN_KIND_TAG.className} flex-none px-[7px] py-0 text-[10px]`}>
                    {IN_KIND_TAG.label}
                  </span>
                )}
                <span
                  className={`min-w-0 text-[13px] font-semibold sm:text-sm ${t.deleted ? 'line-through opacity-60' : ''}`}
                >
                  {entryLine}
                </span>
                {t.deleted && (
                  <span className="tag tag-outline flex-none px-[7px] py-0 text-[10px]">
                    Corrected
                  </span>
                )}
                <span className="text-muted ml-auto flex-none text-[11px] whitespace-nowrap sm:text-xs">
                  <LocalDateTime iso={t.enteredAt.toISOString()} />
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {t.description && (
                  <span className="text-muted text-[11px] sm:text-xs">{t.description}</span>
                )}
                {t.correctsTransaction && (
                  <span className="text-muted text-[10px] sm:text-[11px]">
                    · Corrects {t.correctsTransaction.type} #{t.correctsTransaction.id.slice(-6)}
                  </span>
                )}
                <span className="ml-auto flex flex-wrap items-center gap-[5px]">
                  {t.approvals.map((a) => {
                    const tag = approvalStatusTag(a.status)
                    const label =
                      a.status === ApprovalStatus.DISPUTED && a.resolvedAt
                        ? 'Disputed (resolved)'
                        : tag.label
                    return (
                      <span key={a.id} className={`${tag.className} px-[7px] py-0 text-[10px]`}>
                        {a.shareholder.name} · {label}
                      </span>
                    )
                  })}
                  {!t.deleted && (
                    <Link
                      href={`/accounting/admin/transactions?correct=${t.id}`}
                      className="text-[11px] font-semibold underline underline-offset-[3px] sm:text-xs"
                    >
                      Correct
                    </Link>
                  )}
                </span>
              </div>
              {disputedApprovals.map((a) => (
                <div
                  key={a.id}
                  className="rounded-2xl px-3.5 py-2.5 text-[11px] sm:text-xs"
                  style={{
                    background: 'var(--color-accent-100)',
                    border: '1px solid var(--color-accent-300)',
                    color: 'var(--color-accent-900)',
                  }}
                >
                  <p className="m-0">
                    <span className="font-semibold">{a.shareholder.name} disputed:</span>{' '}
                    {a.disputeReason}
                  </p>
                  {a.resolvedAt ? (
                    <p className="m-0 mt-1" style={{ color: 'var(--color-accent-700)' }}>
                      Resolved {formatDate(a.resolvedAt)}
                      {a.resolutionTransactionId &&
                        ` — correction #${a.resolutionTransactionId.slice(-6)}`}
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <Link
                        href={`/accounting/admin/transactions?correct=${t.id}`}
                        className="font-semibold underline underline-offset-[3px]"
                      >
                        Issue correction
                      </Link>
                      <ResolveDisputeForm approvalId={a.id} />
                    </div>
                  )}
                </div>
              ))}
              <div className="text-muted text-[11px] sm:text-xs">
                Dated {formatDate(t.createdAt)} · Recorded by{' '}
                {t.createdByName ?? t.createdByEmail ?? 'an admin'}
              </div>
            </div>
          )
        })}
        {feed.length === 0 && <p className="text-muted">No activity yet.</p>}
      </div>
    </div>
  )
}
