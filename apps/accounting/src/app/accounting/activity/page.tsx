import Link from "next/link";
import { requireAuthorized } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { formatUSD, formatDate } from "@/lib/format";
import { ApprovalStatus } from "@/generated/prisma/client";
import { ResolveDisputeForm } from "./resolve-dispute-form";

export default async function ActivityPage() {
  const session = await requireAuthorized();
  const isAdmin = session.user.isAccountingAdmin;

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
        <h1 className="text-xl font-semibold">Activity</h1>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/accounting/admin/transactions/new/contribution"
              className="rounded-full bg-lake-700 px-4 py-2 text-sm font-medium text-sand-50"
            >
              Record contribution
            </Link>
            <Link
              href="/accounting/admin/transactions/new/transfer"
              className="rounded-full border border-sand-300 px-4 py-2 text-sm font-medium"
            >
              Record transfer
            </Link>
            <Link
              href="/accounting/admin/transactions/new/adjustment"
              className="rounded-full border border-sand-300 px-4 py-2 text-sm font-medium"
            >
              Record adjustment
            </Link>
          </div>
        )}
      </div>

      <ul className="mt-6 flex flex-col gap-4">
        {transactions.map((t) => (
          <li
            key={t.id}
            className="rounded border border-sand-200 p-4 text-sm"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{t.type}</span>
              <span className="text-stone-500">{formatDate(t.createdAt)}</span>
            </div>
            {t.description && <p className="mt-1">{t.description}</p>}
            {t.correctsTransaction && (
              <p className="mt-1 text-stone-500">
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
            <div className="mt-2 flex flex-col gap-2">
              {t.approvals.map((a) => (
                <div key={a.id}>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                      a.status === ApprovalStatus.CONFIRMED
                        ? "bg-green-100 text-green-800"
                        : a.status === ApprovalStatus.DISPUTED
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {a.shareholder.name}:{" "}
                    {a.status === ApprovalStatus.CONFIRMED
                      ? "Confirmed"
                      : a.status === ApprovalStatus.DISPUTED
                        ? a.resolvedAt
                          ? "Disputed (resolved)"
                          : "Disputed"
                        : "Pending"}
                  </span>
                  {a.status === ApprovalStatus.DISPUTED && (
                    <div className="mt-1 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-900">
                      <p>
                        <span className="font-medium">Reason:</span> {a.disputeReason}
                      </p>
                      {a.resolvedAt ? (
                        <p className="mt-1 text-red-700">
                          Resolved {formatDate(a.resolvedAt)}
                          {a.resolutionTransactionId &&
                            ` — correction #${a.resolutionTransactionId.slice(-6)}`}
                        </p>
                      ) : (
                        isAdmin && (
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <Link href={`/accounting/admin/transactions/${t.id}/correct`} className="underline">
                              Issue correction
                            </Link>
                            <ResolveDisputeForm approvalId={a.id} />
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-stone-400">
                Recorded by {t.createdByName ?? t.createdByEmail ?? "an admin"}
              </p>
              {isAdmin && (
                <Link href={`/accounting/admin/transactions/${t.id}/correct`} className="underline">
                  Correct
                </Link>
              )}
            </div>
          </li>
        ))}
        {transactions.length === 0 && (
          <li className="text-stone-500">No transactions yet.</li>
        )}
      </ul>
    </div>
  );
}
