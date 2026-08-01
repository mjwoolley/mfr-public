import type { TransactionType, ExpenseCategory, ApprovalStatus } from '@/lib/accounting/enums'

/**
 * Marks a share purchase paid in goods or labour rather than money. Defined
 * once here because five surfaces render it (admin history, member dashboard,
 * activity, approval inbox, the notification email).
 */
export const IN_KIND_TAG = { label: 'In kind', className: 'tag tag-outline' } as const

/**
 * Organic tag class + display label for a transaction type.
 *
 * The `CONTRIBUTION` enum value is the database's, and stays; only what the
 * family reads changes — they buy shares, so it says "Share purchase".
 */
export function transactionTypeTag(type: TransactionType): { label: string; className: string } {
  switch (type) {
    case 'CONTRIBUTION':
      return { label: 'Share purchase', className: 'tag tag-accent-2' }
    case 'TRANSFER':
      return { label: 'Transfer', className: 'tag tag-neutral' }
    case 'ADJUSTMENT':
      return { label: 'Adjustment', className: 'tag tag-outline' }
    case 'CORRECTION':
      return { label: 'Correction', className: 'tag tag-accent' }
  }
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  TAXES: 'Taxes',
  INSURANCE: 'Insurance',
  UTILITIES: 'Utilities',
  FURNISHINGS: 'Furnishings',
  REPAIRS: 'Repairs',
  IMPROVEMENTS: 'Improvements',
  OTHER: 'Other',
}

const CATEGORY_TAG_CLASSES: Record<ExpenseCategory, string> = {
  TAXES: 'tag tag-neutral',
  INSURANCE: 'tag tag-outline',
  UTILITIES: 'tag tag-neutral',
  FURNISHINGS: 'tag tag-outline',
  REPAIRS: 'tag tag-accent',
  IMPROVEMENTS: 'tag tag-accent-2',
  OTHER: 'tag tag-neutral',
}

export function expenseCategoryTag(category: ExpenseCategory): {
  label: string
  className: string
} {
  return { label: EXPENSE_CATEGORY_LABELS[category], className: CATEGORY_TAG_CLASSES[category] }
}

export function approvalStatusTag(status: ApprovalStatus): { label: string; className: string } {
  switch (status) {
    case 'CONFIRMED':
      return { label: 'Confirmed', className: 'tag tag-accent-2' }
    case 'DISPUTED':
      return { label: 'Disputed', className: 'tag tag-accent' }
    case 'PENDING':
      return { label: 'Pending', className: 'tag tag-outline' }
  }
}
