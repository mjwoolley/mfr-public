import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatUSD, formatDate } from "@/lib/format";
import { transactionTypeTag } from "@/lib/tags";
import { ApprovalStatus } from "@/generated/prisma/client";
import { ResolveDisputeForm } from "./resolve-dispute-form";

/**
 * The full transaction ledger with the dispute-resolution workflow.
 * Formerly the top-level /accounting/activity tab; folded into Admin in the
 * Organic redesign (the Contributions tab now gives shareholders their
 * transparency view). The admin layout's requireAdmin() gates this.
 */
export default async function AdminActivityPage() {
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
      <p className="text-muted mb-4 text-sm">
        Every transaction on the ledger, with each shareholder&apos;s confirmation status and any
        open disputes.
      </p>

      <div className="flex flex-col gap-3">
        {transactions.map((t) => {
          const typeTag = transactionTypeTag(t.type);
          return (
            <div key={t.id} className="card elev-sm px-5 py-4 text-sm" style={{ gap: 8 }}>
              <div className="flex items-center gap-2.5">
                <span className={typeTag.className}>{typeTag.label}</span>
                <span className="text-muted ml-auto text-[13px]">{formatDate(t.createdAt)}</span>
              </div>
              {t.description && <div>{t.description}</div>}
              {t.correctsTransaction && (
                <div className="text-muted text-xs">
                  Corrects {t.correctsTransaction.type} transaction #
                  {t.correctsTransaction.id.slice(-6)}
                </div>
              )}
              <div className="flex flex-col gap-1">
                {t.entries.map((e) => (
                  <div key={e.id}>
                    {e.shareholder.name}:{" "}
                    <span
                      className="font-semibold"
                      style={{
                        color:
                          Number(e.shares) >= 0
                            ? "var(--color-accent-2-800)"
                            : "var(--color-accent-800)",
                      }}
                    >
                      {Number(e.shares) >= 0 ? "+" : ""}
                      {formatUSD(e.shares.toString())}
                    </span>{" "}
                    shares
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                {t.approvals.map((a) => (
                  <div key={a.id}>
                    <span
                      className={
                        a.status === ApprovalStatus.CONFIRMED
                          ? "tag tag-accent-2"
                          : a.status === ApprovalStatus.DISPUTED
                            ? "tag tag-accent"
                            : "tag tag-outline"
                      }
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
                      <div
                        className="mt-1.5 rounded-2xl px-3.5 py-2.5 text-xs"
                        style={{
                          background: "var(--color-accent-100)",
                          border: "1px solid var(--color-accent-300)",
                          color: "var(--color-accent-900)",
                        }}
                      >
                        <p className="m-0">
                          <span className="font-semibold">Reason:</span> {a.disputeReason}
                        </p>
                        {a.resolvedAt ? (
                          <p className="m-0 mt-1" style={{ color: "var(--color-accent-700)" }}>
                            Resolved {formatDate(a.resolvedAt)}
                            {a.resolutionTransactionId &&
                              ` — correction #${a.resolutionTransactionId.slice(-6)}`}
                          </p>
                        ) : (
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <Link
                              href={`/accounting/admin/transactions?correct=${t.id}`}
                              className="font-semibold underline underline-offset-[3px]"
                            >
                              Issue correction
                            </Link>
                            <ResolveDisputeForm approvalId={a.id} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted text-xs">
                  Recorded by {t.createdByName ?? t.createdByEmail ?? "an admin"}
                </span>
                <Link
                  href={`/accounting/admin/transactions?correct=${t.id}`}
                  className="text-xs font-semibold underline underline-offset-[3px]"
                >
                  Correct
                </Link>
              </div>
            </div>
          );
        })}
        {transactions.length === 0 && <p className="text-muted">No transactions yet.</p>}
      </div>
    </div>
  );
}
