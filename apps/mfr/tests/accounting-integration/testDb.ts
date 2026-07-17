// Prisma-compatible shim over a Drizzle (postgres-js) client bound to the
// dedicated Neon *test* branch. The accounting integration suite is the money-
// code safety net and was written against the old Prisma model API
// (testDb.shareholder.create({ data }), findUnique/findFirst({ where }),
// nested transaction writes, ledgerEntry.aggregate, …). The app has since
// migrated to Drizzle, so rather than rewrite every assertion we give the tests
// back exactly the surface they call. This shim is TEST-ONLY and intentionally
// implements only the Prisma patterns the tests actually use — no more.
//
// Refuses to construct without TEST_DATABASE_URL — that guard is the only thing
// standing between the truncating setup step and a real database.

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/lib/db/schema'

const connectionString = process.env.TEST_DATABASE_URL
if (!connectionString) {
  throw new Error(
    'TEST_DATABASE_URL is not set — integration tests must run against the dedicated Neon test branch, never the real database',
  )
}

// Neon's pooled connection is transaction-mode, which does not support prepared
// statements across connections — disable them.
const client = postgres(connectionString, { prepare: false })
const db = drizzle(client, { schema })

const {
  shareholder,
  transaction,
  ledgerEntry,
  transactionApproval,
  expense,
  contributionGoal,
  appSettings,
} = schema

/* eslint-disable @typescript-eslint/no-explicit-any */

// numeric(12,2) columns are strings in Drizzle; the tests pass raw numbers for
// these. Coerce number → string so cents survive without a float round-trip.
const NUMERIC_KEYS = new Set(['shares', 'amount'])

function coerceValue(key: string, val: any): any {
  if (NUMERIC_KEYS.has(key) && typeof val === 'number') return String(val)
  return val
}

// Prisma returned numeric(12,2) columns as Decimal, whose toString() drops the
// trailing scale zeros ("100.00" → "100"); Drizzle hands back the raw padded
// string. The tests assert on `.toString()`/`Number()` of these, so normalize
// numeric columns on the way out to preserve the old Decimal-string behaviour.
function normalizeNumeric(v: any): any {
  if (typeof v !== 'string' || !/^-?\d+\.\d+$/.test(v)) return v
  return v.replace(/0+$/, '').replace(/\.$/, '')
}

function normalizeRow<T extends Record<string, any> | null>(row: T): T {
  if (!row) return row
  for (const key of NUMERIC_KEYS) {
    if (key in row) (row as any)[key] = normalizeNumeric((row as any)[key])
  }
  return row
}

// Keep only real columns; coerce numerics; default @updatedAt-style columns
// (Prisma auto-set them, Drizzle's schema marks them NOT NULL with no default).
// Returns `any` so Drizzle's strict `.values()` overload accepts the
// dynamically-shaped test insert payload (this is a test-only Prisma shim).
function prepInsert(table: any, data: Record<string, any>): any {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(data)) {
    if (!(k in table)) continue
    out[k] = coerceValue(k, v)
  }
  if ('updatedAt' in table && out.updatedAt === undefined) out.updatedAt = new Date()
  return out
}

// AND of eq()/isNull()/inArray() over the where keys that map to columns.
// Relation-shaped keys (e.g. transaction's `entries`) are handled by callers.
function buildWhere(table: any, where?: Record<string, any>): any {
  if (!where) return undefined
  const conds: any[] = []
  for (const [k, v] of Object.entries(where)) {
    const col = table[k]
    if (!col) continue
    if (v === null) conds.push(isNull(col))
    else if (v && typeof v === 'object' && 'in' in v) conds.push(inArray(col, (v as any).in))
    else conds.push(eq(col, coerceValue(k, v)))
  }
  return conds.length ? and(...conds) : undefined
}

// Generic Prisma-style model over a single Drizzle table.
function makeModel(table: any) {
  const model = {
    async create({ data }: { data: Record<string, any> }) {
      const [row] = await db.insert(table).values(prepInsert(table, data)).returning()
      return normalizeRow(row)
    },
    async findUnique({ where }: { where: Record<string, any> }) {
      const rows = await db.select().from(table).where(buildWhere(table, where)).limit(1)
      return normalizeRow(rows[0] ?? null)
    },
    async findFirst({ where }: { where?: Record<string, any> } = {}) {
      const rows = await db.select().from(table).where(buildWhere(table, where)).limit(1)
      return normalizeRow(rows[0] ?? null)
    },
    async findUniqueOrThrow(args: { where: Record<string, any> }) {
      const row = await model.findUnique(args)
      if (!row) throw new Error('No record found (findUniqueOrThrow)')
      return row
    },
    async findFirstOrThrow(args: { where?: Record<string, any> } = {}) {
      const row = await model.findFirst(args)
      if (!row) throw new Error('No record found (findFirstOrThrow)')
      return row
    },
    async findMany({ where }: { where?: Record<string, any> } = {}) {
      const rows = await db.select().from(table).where(buildWhere(table, where))
      return rows.map(normalizeRow)
    },
    async update({ where, data }: { where: Record<string, any>; data: Record<string, any> }) {
      const [row] = await db
        .update(table)
        .set(prepInsert(table, data))
        .where(buildWhere(table, where))
        .returning()
      return normalizeRow(row)
    },
    async delete({ where }: { where: Record<string, any> }) {
      return db.delete(table).where(buildWhere(table, where))
    },
  }
  return model
}

// Attach approvals[] to a transaction row (Prisma include: { approvals: true }).
async function withApprovals(row: any) {
  if (!row) return row
  row.approvals = await db
    .select()
    .from(transactionApproval)
    .where(eq(transactionApproval.transactionId, row.id))
  return row
}

// Resolve a transaction `where` that may carry the relation filter
// `entries: { some: { shareholderId } }` (find the transaction owning a ledger
// entry for that shareholder). Returns a single row (findFirst semantics).
async function transactionFind(where?: Record<string, any>, include?: any) {
  const conds: any[] = []
  const plain: Record<string, any> = {}
  for (const [k, v] of Object.entries(where ?? {})) {
    if (k === 'entries') {
      const some = (v as any).some ?? {}
      const les = await db
        .select({ tid: ledgerEntry.transactionId })
        .from(ledgerEntry)
        .where(buildWhere(ledgerEntry, some))
      const ids = les.map((l) => l.tid)
      if (!ids.length) return null
      conds.push(inArray(transaction.id, ids))
    } else {
      plain[k] = v
    }
  }
  const pw = buildWhere(transaction, plain)
  if (pw) conds.push(pw)
  const rows = await db
    .select()
    .from(transaction)
    .where(conds.length ? and(...conds) : undefined)
    .limit(1)
  let row = rows[0] ?? null
  if (row && include?.approvals) row = await withApprovals(row)
  return row
}

const transactionModel = {
  // Nested writes: data.entries.create / data.approvals.create each accept a
  // single object or an array. The parent + children go in one DB transaction.
  async create({ data, include }: { data: Record<string, any>; include?: any }) {
    const { entries, approvals, ...rest } = data
    return db.transaction(async (tx) => {
      const [row] = await tx.insert(transaction).values(prepInsert(transaction, rest)).returning()

      const entryCreate = entries?.create
      if (entryCreate) {
        const list = Array.isArray(entryCreate) ? entryCreate : [entryCreate]
        await tx
          .insert(ledgerEntry)
          .values(list.map((e) => prepInsert(ledgerEntry, { ...e, transactionId: row.id })))
      }

      const approvalCreate = approvals?.create
      if (approvalCreate) {
        const list = Array.isArray(approvalCreate) ? approvalCreate : [approvalCreate]
        await tx
          .insert(transactionApproval)
          .values(list.map((a) => prepInsert(transactionApproval, { ...a, transactionId: row.id })))
      }

      const result: any = row
      if (include?.approvals) {
        result.approvals = await tx
          .select()
          .from(transactionApproval)
          .where(eq(transactionApproval.transactionId, row.id))
      }
      return result
    })
  },
  async findFirst({ where, include }: { where?: Record<string, any>; include?: any } = {}) {
    return transactionFind(where, include)
  },
  async findFirstOrThrow({ where, include }: { where?: Record<string, any>; include?: any } = {}) {
    const row = await transactionFind(where, include)
    if (!row) throw new Error('No record found (findFirstOrThrow)')
    return row
  },
  async findUnique({ where, include }: { where: Record<string, any>; include?: any }) {
    let row =
      (await db.select().from(transaction).where(buildWhere(transaction, where)).limit(1))[0] ??
      null
    if (row && include?.approvals) row = await withApprovals(row)
    return row
  },
  async delete({ where }: { where: Record<string, any> }) {
    return db.delete(transaction).where(buildWhere(transaction, where))
  },
}

const ledgerEntryModel = {
  ...makeModel(ledgerEntry),
  // aggregate({ where, _sum: { shares: true } }) → { _sum: { shares } }.
  // Supports where.shareholderId (eq on LedgerEntry) and the nested relation
  // filter where.transaction.deleted (inner-join Transaction, eq on it).
  async aggregate({ where, _sum }: { where?: Record<string, any>; _sum?: any }) {
    const conds: any[] = []
    let joinTx = false
    for (const [k, v] of Object.entries(where ?? {})) {
      if (k === 'transaction') {
        joinTx = true
        for (const [tk, tv] of Object.entries(v as Record<string, any>)) {
          conds.push(eq((transaction as any)[tk], tv))
        }
      } else if ((ledgerEntry as any)[k]) {
        conds.push(eq((ledgerEntry as any)[k], coerceValue(k, v)))
      }
    }
    // coalesce(...,0)::text: never null, so Number(_sum.shares) is safe and the
    // tests compare via Number(...) === expected.
    let q: any = db
      .select({ shares: sql<string>`coalesce(sum(${ledgerEntry.shares}), 0)::text` })
      .from(ledgerEntry)
    if (joinTx) q = q.innerJoin(transaction, eq(ledgerEntry.transactionId, transaction.id))
    const [row] = await q.where(conds.length ? and(...conds) : undefined)
    return { _sum: { shares: _sum?.shares ? row.shares : null } }
  },
}

export const testDb = {
  shareholder: makeModel(shareholder),
  transaction: transactionModel,
  ledgerEntry: ledgerEntryModel,
  transactionApproval: makeModel(transactionApproval),
  expense: makeModel(expense),
  contributionGoal: makeModel(contributionGoal),
  appSettings: makeModel(appSettings),
}
