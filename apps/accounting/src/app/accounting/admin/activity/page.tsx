import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatUSD, formatDate } from "@/lib/format";
import { transactionTypeTag, approvalStatusTag } from "@/lib/tags";
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

      <div className="flex flex-col gap-2">
        {transactions.map((t) => {
          const typeTag = transactionTypeTag(t.type);
          const entryLine = t.entries
            .map((e) => {
              const shares = Number(e.shares);
              return `${e.shareholder.name} ${shares >= 0 ? "+" : ""}${formatUSD(e.shares.toString())}`;
            })
            .join(" · ");
          const disputedApprovals = t.approvals.filter((a) => a.status === ApprovalStatus.DISPUTED);
          return (
            <div key={t.id} className="card elev-sm px-4 py-3 text-sm" style={{ gap: 5 }}>
              <div className="flex items-center gap-2.5">
                <span className={`${typeTag.className} flex-none`}>{typeTag.label}</span>
                <span
                  className={`min-w-0 text-sm font-semibold ${t.deleted ? "line-through opacity-60" : ""}`}
                >
                  {entryLine}
                </span>
                {t.deleted && (
                  <span className="tag tag-outline flex-none px-[7px] py-0 text-[10px]">
                    Corrected
                  </span>
                )}
                <span className="text-muted ml-auto flex-none text-xs whitespace-nowrap">
                  {formatDate(t.createdAt)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {t.description && <span className="text-muted text-xs">{t.description}</span>}
                {t.correctsTransaction && (
                  <span className="text-muted text-[11px]">
                    · Corrects {t.correctsTransaction.type} #{t.correctsTransaction.id.slice(-6)}
                  </span>
                )}
                <span className="ml-auto flex flex-wrap items-center gap-[5px]">
                  {t.approvals.map((a) => {
                    const tag = approvalStatusTag(a.status);
                    const label =
                      a.status === ApprovalStatus.DISPUTED && a.resolvedAt
                        ? "Disputed (resolved)"
                        : tag.label;
                    return (
                      <span key={a.id} className={`${tag.className} px-[7px] py-0 text-[10px]`}>
                        {a.shareholder.name} · {label}
                      </span>
                    );
                  })}
                  {!t.deleted && (
                    <Link
                      href={`/accounting/admin/transactions?correct=${t.id}`}
                      className="text-xs font-semibold underline underline-offset-[3px]"
                    >
                      Correct
                    </Link>
                  )}
                </span>
              </div>
              {disputedApprovals.map((a) => (
                <div
                  key={a.id}
                  className="rounded-2xl px-3.5 py-2.5 text-xs"
                  style={{
                    background: "var(--color-accent-100)",
                    border: "1px solid var(--color-accent-300)",
                    color: "var(--color-accent-900)",
                  }}
                >
                  <p className="m-0">
                    <span className="font-semibold">{a.shareholder.name} disputed:</span>{" "}
                    {a.disputeReason}
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
              ))}
              <div className="text-muted text-xs">
                Recorded by {t.createdByName ?? t.createdByEmail ?? "an admin"}
              </div>
            </div>
          );
        })}
        {transactions.length === 0 && <p className="text-muted">No transactions yet.</p>}
      </div>
    </div>
  );
}
