// Shared fixtures for the requirements-*.test.ts integration files (CAP-030..
// CAP-042 coverage). Local to those files — the older suites keep their own
// helpers. Every shareholder is uniquely named, and cleanup removes every
// transaction that touched one of them (ledger entries and approvals cascade),
// so these files never assert on, or leave behind, anyone else's rows.

import { testDb } from './testDb'

// Auth.js session shapes the authz helpers read.
export function adminSession() {
  return {
    user: {
      id: 'admin-req',
      status: 'approved',
      roles: { siteOwner: false, siteManager: false, accountingManager: true },
      shareholderId: null,
      email: 'ada.admin@example.com',
      name: 'Ada Admin',
    },
    expires: '2099-01-01',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

export function shareholderSession(shareholderId: string) {
  return {
    user: {
      id: `user-for-${shareholderId}`,
      status: 'approved',
      roles: { siteOwner: false, siteManager: false, accountingManager: false },
      shareholderId,
      email: 'shareholder@example.com',
    },
    expires: '2099-01-01',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

export function fd(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const created: string[] = []

export async function makeShareholder(
  label: string,
  opts: { email?: boolean; active?: boolean } = {},
) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const sh = await testDb.shareholder.create({
    data: {
      name: `${label} ${tag}`,
      email: opts.email ? `${label.toLowerCase().replace(/\W+/g, '.')}.${tag}@example.com` : null,
      active: opts.active ?? true,
    },
  })
  created.push(sh.id)
  return sh
}

export type ApprovalRow = {
  id: string
  shareholderId: string
  status: 'PENDING' | 'CONFIRMED' | 'DISPUTED'
}

/** Every transaction with a ledger entry for this shareholder, oldest insert
 * first, each with its approval rows. */
export async function transactionsFor(shareholderId: string) {
  const entries = await testDb.ledgerEntry.findMany({ where: { shareholderId } })
  const ids = [...new Set(entries.map((e) => e.transactionId as string))]
  const rows = await Promise.all(
    ids.map(async (id) => {
      const row = await testDb.transaction.findUnique({ where: { id } })
      if (!row) return null
      const approvals = (await testDb.transactionApproval.findMany({
        where: { transactionId: id },
      })) as ApprovalRow[]
      return { ...row, approvals }
    }),
  )
  return rows
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime())
}

export async function cleanupFixtures() {
  for (const shareholderId of created) {
    for (const t of await transactionsFor(shareholderId)) {
      await testDb.transaction.delete({ where: { id: t.id } }).catch(() => {})
    }
  }
  for (const id of created) {
    await testDb.shareholder.delete({ where: { id } }).catch(() => {})
  }
  created.length = 0
}

/** YYYY-MM-DD of a date N days before now (UTC), for back-dated entries. */
export function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
}
