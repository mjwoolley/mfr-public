import { currentFiscalYear, fiscalYearLabel } from '@/lib/accounting/fiscalYear'

/**
 * One-line explainer shown on tabs whose figures bucket by fiscal year
 * (Share purchases, Expenses), with the current fiscal year as a concrete
 * example. The default classes suit a page-level note; pass `className` for
 * tighter placements (e.g. inside a card).
 */
export function FiscalYearNote({
  className = 'text-muted mb-6 max-w-[70ch] text-[13px]',
}: {
  className?: string
}) {
  const fy = currentFiscalYear()
  return (
    <p className={className}>
      The corporation&apos;s fiscal year runs March 1 through the end of February —{' '}
      {fiscalYearLabel(fy)} is March {fy} through February {fy + 1}.
    </p>
  )
}
