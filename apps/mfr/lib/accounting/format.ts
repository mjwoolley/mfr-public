// Display formatting for the accounting views.
//
// Shares and dollars are numerically identical here ($1 buys 1 share), which is
// why shares were historically rendered as currency — producing lines like
// "$1,234,567.00 shares outstanding". They are now formatted as what they are:
// counts. `formatUSD0` remains for the things that really are money (expenses,
// Venmo, the income-vs-expense chart).

const sharesFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  // Not 0: LedgerEntry.shares is numeric(12,2), and rounding a fractional
  // holding away in the ownership report would be a misreport, not a tidy-up.
  maximumFractionDigits: 2,
})

const usd0Format = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function toNumber(value: number | string) {
  return typeof value === 'string' ? Number(value) : value
}

/** A share quantity: `1,234` / `1,234.5`. Never a dollar sign. */
export function formatShares(value: number | string) {
  return sharesFormat.format(toNumber(value))
}

/** A share quantity with an explicit sign, for ledger movements: `+250`, `-100`. */
export function signedShares(value: number | string) {
  const n = toNumber(value)
  return `${n >= 0 ? '+' : ''}${formatShares(n)}`
}

/** Whole dollars: `$1,235`. For money — expenses, Venmo, cash-flow charts. */
export function formatUSD0(amount: number | string) {
  return usd0Format.format(toNumber(amount))
}

/** Whole dollars with an explicit sign: `+$1,235`, `-$980`. */
export function signedUSD0(amount: number | string) {
  const n = toNumber(amount)
  return `${n >= 0 ? '+' : ''}${usd0Format.format(n)}`
}

export function formatDate(date: Date) {
  // Explicitly UTC: back-dated transactions are stored at noon UTC and all
  // fiscal-year math reads getUTC*, so rendering in the server's local zone
  // would let the displayed day disagree with the year the amount counted in.
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}
