import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatUSD, formatDate } from "@/lib/format";

export default async function AdminTransactionsPage() {
  const transactions = await prisma.transaction.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      entries: { include: { shareholder: { select: { name: true } } } },
      approvals: { include: { shareholder: { select: { name: true } } } },
      correctsTransaction: { select: { id: true, type: true } },
    },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-y-3">
        <h1 className="text-xl font-semibold">Activity log</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/accounting/admin/transactions/new/contribution"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Record contribution
          </Link>
          <Link
            href="/accounting/admin/transactions/new/transfer"
            className="rounded-full border border-black/20 px-4 py-2 text-sm font-medium dark:border-white/20"
          >
            Record transfer
          </Link>
          <Link
            href="/accounting/admin/transactions/new/adjustment"
            className="rounded-full border border-black/20 px-4 py-2 text-sm font-medium dark:border-white/20"
          >
            Record adjustment
          </Link>
        </div>
      </div>

      <ul className="mt-6 flex flex-col gap-4">
        {transactions.map((t) => (
          <li
            key={t.id}
            className="rounded border border-black/10 p-4 text-sm dark:border-white/10"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{t.type}</span>
              <span className="text-black/50 dark:text-white/50">{formatDate(t.createdAt)}</span>
            </div>
            {t.description && <p className="mt-1">{t.description}</p>}
            {t.correctsTransaction && (
              <p className="mt-1 text-black/50 dark:text-white/50">
                Corrects {t.correctsTransaction.type} transaction #{t.correctsTransaction.id.slice(-6)}
              </p>
            )}
            <ul className="mt-2 flex flex-col gap-1">
              {t.entries.map((e) => (
                <li key={e.id}>
                  {e.shareholder.name}: {Number(e.shares) >= 0 ? "+" : ""}
                  {formatUSD(e.shares.toString())} shares
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              {t.approvals.map((a) => (
                <span
                  key={a.id}
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    a.approvedAt
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                  }`}
                >
                  {a.shareholder.name}: {a.approvedAt ? "Approved" : "Pending"}
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-black/40 dark:text-white/40">
                Recorded by {t.createdByName ?? t.createdByEmail ?? "an admin"}
              </p>
              <Link href={`/accounting/admin/transactions/${t.id}/correct`} className="underline">
                Correct
              </Link>
            </div>
          </li>
        ))}
        {transactions.length === 0 && (
          <li className="text-black/50 dark:text-white/50">No transactions yet.</li>
        )}
      </ul>
    </div>
  );
}
