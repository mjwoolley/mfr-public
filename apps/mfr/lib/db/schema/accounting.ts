// Accounting domain schema — introspected byte-faithful from the accounting
// production database (drizzle-kit pull), so the real, hand-loaded share
// history + expense rows copy over verbatim during the merge: same table names
// ("Shareholder", "Transaction", …), `cuid` text PKs, enums, `numeric(12,2)`
// money columns, `timestamp(3)`, indexes, and FKs. Only the query layer changes
// (Prisma → Drizzle); the storage is unchanged.
//
// Deliberately NOT carried over: Prisma's `_prisma_migrations` journal table —
// the unified DB is drizzle-kit push-managed (an accepted consequence of the
// single-ORM decision).
//
// Timestamps use `mode: 'date'` to match Prisma's `DateTime` → JS `Date`
// returns (fiscal-year bucketing reads getUTCMonth/getUTCFullYear off a Date).
// This is a JS-side mapping only — the DDL is `timestamp(3) without time zone`
// either way. Money columns stay `numeric` (drizzle returns a string) so cents
// are never routed through a float; the ledger wraps them in Decimal.

import { createId } from '@paralleldrive/cuid2'
import { relations, sql } from 'drizzle-orm'
import {
  pgTable,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  foreignKey,
  pgEnum,
} from 'drizzle-orm/pg-core'

export const approvalStatus = pgEnum('ApprovalStatus', ['PENDING', 'CONFIRMED', 'DISPUTED'])
export const expenseCategory = pgEnum('ExpenseCategory', [
  'TAXES',
  'INSURANCE',
  'UTILITIES',
  'FURNISHINGS',
  'REPAIRS',
  'IMPROVEMENTS',
  'OTHER',
])
export const transactionType = pgEnum('TransactionType', [
  'CONTRIBUTION',
  'TRANSFER',
  'ADJUSTMENT',
  'CORRECTION',
])

export const shareholder = pgTable(
  'Shareholder',
  {
    id: text()
      .primaryKey()
      .notNull()
      .$defaultFn(() => createId()),
    name: text().notNull(),
    email: text(),
    active: boolean().default(true).notNull(),
    createdAt: timestamp({ precision: 3, mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    userId: text(),
  },
  (table) => [
    uniqueIndex('Shareholder_email_key').using(
      'btree',
      table.email.asc().nullsLast().op('text_ops'),
    ),
    uniqueIndex('Shareholder_userId_key').using(
      'btree',
      table.userId.asc().nullsLast().op('text_ops'),
    ),
  ],
)

export const transaction = pgTable(
  'Transaction',
  {
    id: text()
      .primaryKey()
      .notNull()
      .$defaultFn(() => createId()),
    type: transactionType().notNull(),
    description: text(),
    // A non-cash share purchase — goods or labour rather than money. Lives on
    // the transaction (like `description`, which it makes mandatory) rather
    // than the ledger entry: it describes the purchase event, and every display
    // surface already loads the transaction row. NOT NULL DEFAULT false so
    // Postgres adds it without rewriting the table and pre-existing code that
    // omits it on INSERT still works during a rollback window.
    inKind: boolean().default(false).notNull(),
    createdAt: timestamp({ precision: 3, mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdById: text().notNull(),
    createdByName: text(),
    createdByEmail: text(),
    correctsTransactionId: text(),
    deleted: boolean().default(false).notNull(),
    deletedAt: timestamp({ precision: 3, mode: 'date' }),
  },
  (table) => [
    index('Transaction_correctsTransactionId_idx').using(
      'btree',
      table.correctsTransactionId.asc().nullsLast().op('text_ops'),
    ),
    index('Transaction_type_idx').using('btree', table.type.asc().nullsLast().op('enum_ops')),
    foreignKey({
      columns: [table.correctsTransactionId],
      foreignColumns: [table.id],
      name: 'Transaction_correctsTransactionId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ],
)

export const ledgerEntry = pgTable(
  'LedgerEntry',
  {
    id: text()
      .primaryKey()
      .notNull()
      .$defaultFn(() => createId()),
    transactionId: text().notNull(),
    shareholderId: text().notNull(),
    shares: numeric({ precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp({ precision: 3, mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index('LedgerEntry_shareholderId_idx').using(
      'btree',
      table.shareholderId.asc().nullsLast().op('text_ops'),
    ),
    index('LedgerEntry_transactionId_idx').using(
      'btree',
      table.transactionId.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.transactionId],
      foreignColumns: [transaction.id],
      name: 'LedgerEntry_transactionId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.shareholderId],
      foreignColumns: [shareholder.id],
      name: 'LedgerEntry_shareholderId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ],
)

export const transactionApproval = pgTable(
  'TransactionApproval',
  {
    id: text()
      .primaryKey()
      .notNull()
      .$defaultFn(() => createId()),
    transactionId: text().notNull(),
    shareholderId: text().notNull(),
    createdAt: timestamp({ precision: 3, mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    confirmedAt: timestamp({ precision: 3, mode: 'date' }),
    disputeReason: text(),
    disputedAt: timestamp({ precision: 3, mode: 'date' }),
    resolutionTransactionId: text(),
    resolvedAt: timestamp({ precision: 3, mode: 'date' }),
    status: approvalStatus().default('PENDING').notNull(),
  },
  (table) => [
    index('TransactionApproval_shareholderId_idx').using(
      'btree',
      table.shareholderId.asc().nullsLast().op('text_ops'),
    ),
    uniqueIndex('TransactionApproval_transactionId_shareholderId_key').using(
      'btree',
      table.transactionId.asc().nullsLast().op('text_ops'),
      table.shareholderId.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.transactionId],
      foreignColumns: [transaction.id],
      name: 'TransactionApproval_transactionId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.shareholderId],
      foreignColumns: [shareholder.id],
      name: 'TransactionApproval_shareholderId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
  ],
)

export const expense = pgTable(
  'Expense',
  {
    id: text()
      .primaryKey()
      .notNull()
      .$defaultFn(() => createId()),
    description: text().notNull(),
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    incurredAt: timestamp({ precision: 3, mode: 'date' }).notNull(),
    createdAt: timestamp({ precision: 3, mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdByUserId: text().notNull(),
    createdByName: text(),
    createdByEmail: text(),
    capital: boolean().default(false).notNull(),
    category: expenseCategory().notNull(),
    updatedAt: timestamp({ precision: 3, mode: 'date' }).notNull(),
  },
  (table) => [
    index('Expense_incurredAt_idx').using(
      'btree',
      table.incurredAt.asc().nullsLast().op('timestamp_ops'),
    ),
  ],
)

export const contributionGoal = pgTable('ContributionGoal', {
  year: integer().primaryKey().notNull(),
  amount: numeric({ precision: 12, scale: 2 }).notNull(),
  updatedAt: timestamp({ precision: 3, mode: 'date' }).notNull(),
})

export const appSettings = pgTable('AppSettings', {
  id: text().default('singleton').primaryKey().notNull(),
  contributionsVisibleToAll: boolean().default(true).notNull(),
  updatedAt: timestamp({ precision: 3, mode: 'date' }).notNull(),
})

// Row types (Prisma model parity for the Drizzle rewrite).
export type ShareholderRow = typeof shareholder.$inferSelect
export type TransactionRow = typeof transaction.$inferSelect
export type LedgerEntryRow = typeof ledgerEntry.$inferSelect
export type TransactionApprovalRow = typeof transactionApproval.$inferSelect
export type ExpenseRow = typeof expense.$inferSelect
export type ContributionGoalRow = typeof contributionGoal.$inferSelect
export type AppSettingsRow = typeof appSettings.$inferSelect

// Relations for Drizzle relational queries (db.query.*.findMany({ with })),
// mirroring the former Prisma model relations used by the nested include reads
// (dashboard, inbox, admin activity/transactions, contributions).
export const shareholderRelations = relations(shareholder, ({ many }) => ({
  ledgerEntries: many(ledgerEntry),
  approvals: many(transactionApproval),
}))

export const transactionRelations = relations(transaction, ({ many, one }) => ({
  entries: many(ledgerEntry),
  approvals: many(transactionApproval),
  correctsTransaction: one(transaction, {
    fields: [transaction.correctsTransactionId],
    references: [transaction.id],
    relationName: 'corrections',
  }),
  correctedBy: many(transaction, { relationName: 'corrections' }),
}))

export const ledgerEntryRelations = relations(ledgerEntry, ({ one }) => ({
  transaction: one(transaction, {
    fields: [ledgerEntry.transactionId],
    references: [transaction.id],
  }),
  shareholder: one(shareholder, {
    fields: [ledgerEntry.shareholderId],
    references: [shareholder.id],
  }),
}))

export const transactionApprovalRelations = relations(transactionApproval, ({ one }) => ({
  transaction: one(transaction, {
    fields: [transactionApproval.transactionId],
    references: [transaction.id],
  }),
  shareholder: one(shareholder, {
    fields: [transactionApproval.shareholderId],
    references: [shareholder.id],
  }),
}))
