// Money type for the accounting domain. Drizzle's `numeric(12,2)` columns come
// back as strings (never floats), and this Decimal — a drop-in for the former
// Prisma.Decimal — does the exact share/amount arithmetic (.add/.div/.mul/
// .isZero/comparisons) the ledger and expense math rely on.
export { Decimal } from 'decimal.js'
