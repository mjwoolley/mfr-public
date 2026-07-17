// Accounting enums as a drop-in for the former Prisma-generated enums
// (`@/lib/accounting/enums`), which were used both as TYPES (`x: TransactionType`)
// and as VALUES (`TransactionType.CONTRIBUTION`). Each name below is declared as
// both a type (a string union derived from the Drizzle pgEnum) and a value
// object, so call sites only need to repoint the import.

import { approvalStatus, expenseCategory, transactionType } from '@/lib/db/schema'

export type TransactionType = (typeof transactionType.enumValues)[number]
export type ApprovalStatus = (typeof approvalStatus.enumValues)[number]
export type ExpenseCategory = (typeof expenseCategory.enumValues)[number]

export const TransactionType = {
  CONTRIBUTION: 'CONTRIBUTION',
  TRANSFER: 'TRANSFER',
  ADJUSTMENT: 'ADJUSTMENT',
  CORRECTION: 'CORRECTION',
} as const satisfies Record<string, TransactionType>

export const ApprovalStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  DISPUTED: 'DISPUTED',
} as const satisfies Record<string, ApprovalStatus>

export const ExpenseCategory = {
  TAXES: 'TAXES',
  INSURANCE: 'INSURANCE',
  UTILITIES: 'UTILITIES',
  FURNISHINGS: 'FURNISHINGS',
  REPAIRS: 'REPAIRS',
  IMPROVEMENTS: 'IMPROVEMENTS',
  OTHER: 'OTHER',
} as const satisfies Record<string, ExpenseCategory>
