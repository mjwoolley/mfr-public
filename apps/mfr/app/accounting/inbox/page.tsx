// Shareholder inbox: PENDING approval rows for this shareholder's own
// transactions, with confirm/dispute actions. Purely informational — items
// already count toward balances (see actions/approvals.ts).

import { requireShareholder } from "@/lib/accounting/authz";
import { db } from "@/lib/db/client";
import { transactionApproval } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { formatUSD, formatDate } from "@/lib/accounting/format";
import { transactionTypeTag } from "@/lib/accounting/tags";
import { ApprovalStatus } from "@/lib/accounting/enums";
import { InboxApprovalActions } from "./inbox-approval-actions";

export default async function InboxPage() {
  const session = await requireShareholder();

  const pending = await db.query.transactionApproval.findMany({
    where: and(
      eq(transactionApproval.shareholderId, session.user.shareholderId),
      eq(transactionApproval.status, ApprovalStatus.PENDING),
    ),
    orderBy: [desc(transactionApproval.createdAt)],
    with: {
      transaction: {
        with: {
          entries: {
            where: (entry, { eq }) => eq(entry.shareholderId, session.user.shareholderId),
          },
        },
      },
    },
  });

  return (
    <div>
      <h1 className="mb-2 text-4xl">Inbox</h1>
      <p className="text-muted mb-6 max-w-[60ch] text-[15px]">
        These are already reflected in your balance. Confirming just acknowledges you&apos;ve seen
        them — it doesn&apos;t change anything. If something looks wrong, dispute it instead.
      </p>

      {pending.length === 0 ? (
        <div
          className="p-11 text-center"
          style={{ background: "var(--color-accent-2-100)", borderRadius: "var(--radius-lg)" }}
        >
          <div
            className="text-[22px]"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-accent-2-800)" }}
          >
            You&apos;re all caught up
          </div>
          <div className="mt-1.5 text-sm" style={{ color: "var(--color-accent-2-800)" }}>
            Nothing pending your approval.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {pending.map((approval) => {
            const entry = approval.transaction.entries[0];
            const recordedBy =
              approval.transaction.createdByName ??
              approval.transaction.createdByEmail ??
              "an admin";
            const typeTag = transactionTypeTag(approval.transaction.type);
            const shares = entry ? Number(entry.shares) : 0;
            return (
              <div key={approval.id} className="card elev-sm px-5 py-4" style={{ gap: 8 }}>
                <div className="flex items-center gap-2.5">
                  <span className={typeTag.className}>{typeTag.label}</span>
                  {entry && (
                    <span
                      className="ml-0.5 text-[19px]"
                      style={{
                        fontFamily: "var(--font-heading)",
                        color:
                          shares >= 0 ? "var(--color-accent-2-800)" : "var(--color-accent-800)",
                      }}
                    >
                      {shares >= 0 ? "+" : ""}
                      {formatUSD(entry.shares.toString())}
                    </span>
                  )}
                  <span className="text-muted ml-auto text-[13px]">
                    {formatDate(approval.transaction.createdAt)}
                  </span>
                </div>
                {approval.transaction.description && (
                  <div className="text-sm">{approval.transaction.description}</div>
                )}
                <div className="text-muted text-xs">Recorded by {recordedBy}</div>
                <InboxApprovalActions approvalId={approval.id} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
