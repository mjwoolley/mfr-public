'use client'

// Contributions tab (client half): toggles between the per-shareholder and
// per-fiscal-year groupings computed in contributionsGrouping.ts, with
// expand/collapse per group.

import { useState } from 'react'
import { transactionTypeTag } from '@/lib/accounting/tags'
import { fiscalYearLabel } from '@/lib/accounting/fiscalYear'
import type { ShareholderGroup, YearGroup } from './contributionsGrouping'

const usd0 = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)

const signed = (n: number) => (n >= 0 ? '+' : '') + usd0(n)

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' })
}

function EntryLine({
  entry,
  showWho,
}: {
  entry: ShareholderGroup['entries'][number]
  showWho: boolean
}) {
  const tag = transactionTypeTag(entry.type as Parameters<typeof transactionTypeTag>[0])
  return (
    <div
      className={`flex items-center gap-3 py-2 text-sm ${entry.deleted ? 'line-through opacity-60' : ''}`}
      style={{ borderTop: '1px solid var(--color-divider)' }}
    >
      <span className="text-muted w-[104px] flex-none text-[13px]">{fmtDate(entry.date)}</span>
      <span className={`${tag.className} flex-none`}>{tag.label}</span>
      <span
        className="flex-1"
        style={{ color: 'color-mix(in srgb, var(--color-text) 80%, transparent)' }}
      >
        {showWho
          ? `${entry.shareholderName}${entry.description ? ` — ${entry.description}` : ''}`
          : (entry.description ?? '')}
        {entry.deleted && <span className="no-underline text-muted"> (corrected)</span>}
      </span>
      <span
        className="font-semibold"
        style={{
          fontVariantNumeric: 'tabular-nums',
          color: entry.amount >= 0 ? 'var(--color-accent-2-800)' : 'var(--color-accent-800)',
        }}
      >
        {signed(entry.amount)}
      </span>
    </div>
  )
}

interface ContributionsClientProps {
  perShareholder: ShareholderGroup[]
  perYear: YearGroup[]
  currentShareholderId: string | null
}

export function ContributionsClient({
  perShareholder,
  perYear,
  currentShareholderId,
}: ContributionsClientProps) {
  const [group, setGroup] = useState<'shareholder' | 'year'>('shareholder')

  return (
    <div>
      <div className="mb-3.5">
        <h2 className="m-0 mb-2.5 text-[22px]">
          {group === 'year'
            ? 'Contributions and transfers by year'
            : 'Contributions and transfers by shareholder'}
        </h2>
        <div className="seg" style={{ background: 'var(--color-surface)' }}>
          <label className="seg-opt">
            <input
              type="radio"
              name="contrib-grouping"
              checked={group === 'shareholder'}
              onChange={() => setGroup('shareholder')}
            />
            By shareholder
          </label>
          <label className="seg-opt">
            <input
              type="radio"
              name="contrib-grouping"
              checked={group === 'year'}
              onChange={() => setGroup('year')}
            />
            By year
          </label>
        </div>
      </div>

      {group === 'shareholder' ? (
        <div className="flex flex-col gap-3.5">
          {perShareholder.map((p) => (
            <div
              key={p.shareholderId}
              className="card elev-sm bg-white px-5 py-4"
              style={{ gap: 12 }}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[19px]" style={{ fontFamily: 'var(--font-heading)' }}>
                  {p.name}
                </span>
                {p.shareholderId === currentShareholderId && (
                  <span className="tag tag-accent px-2 py-0 text-[10px]">You</span>
                )}
                <span className="text-muted ml-auto text-[13px]">
                  Contributed {usd0(p.contributed)} · Balance {usd0(p.balance)} · {p.pct.toFixed(1)}
                  %
                </span>
              </div>
              <div className="flex flex-col">
                {p.entries.map((e, i) => (
                  <EntryLine key={i} entry={e} showWho={false} />
                ))}
                {p.entries.length === 0 && (
                  <p className="text-muted m-0 py-2 text-sm">No entries yet.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {perYear.map((y) => (
            <div key={y.year} className="card elev-sm bg-white px-5 py-4" style={{ gap: 12 }}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[19px]" style={{ fontFamily: 'var(--font-heading)' }}>
                  {fiscalYearLabel(y.year)}
                </span>
                <span className="text-muted ml-auto text-[13px]">
                  {usd0(y.newShares)} in new shares
                </span>
              </div>
              <div className="flex flex-col">
                {y.entries.map((e, i) => (
                  <EntryLine key={i} entry={e} showWho />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
