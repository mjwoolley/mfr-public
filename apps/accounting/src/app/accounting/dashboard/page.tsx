// Shareholder dashboard: share balance + ownership %, the current fiscal
// year's contribution-goal tracker (with Venmo QR when configured), and the
// shareholder's full entry history with approval/dispute states inline.

import QRCode from "qrcode";
import { requireShareholder } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getShareholderBalance, getTotalSharesOutstanding } from "@/lib/ledger";
import { getContributionGoal, computeGoalProgress } from "@/lib/goals";
import { currentFiscalYear, fiscalYearRange, fiscalYearLabel } from "@/lib/fiscalYear";
import { getVenmoConfig } from "@/lib/venmo";
import { formatUSD, formatDate } from "@/lib/format";
import { transactionTypeTag } from "@/lib/tags";
import { ApprovalStatus, TransactionType } from "@/generated/prisma/client";
import { VenmoDialogButton } from "./venmo-dialog";
import { DisputeEntryActions } from "./dispute-actions";

const usd0 = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default async function DashboardPage() {
  const session = await requireShareholder();
  const shareholderId = session.user.shareholderId;
  const currentFY = currentFiscalYear();
  const { start: yearStart, end: nextYearStart } = fiscalYearRange(currentFY);

  // One parallel round-trip for everything on the page. "Raised this year"
  // sums contribution entries across ALL shareholders inside the current
  // fiscal-year range (Mar 1 → Mar 1, half-open) — it feeds the shared goal
  // tracker, not this shareholder's personal totals.
  const [shareholder, balance, total, entries, goal, raisedAggregate] = await Promise.all([
    prisma.shareholder.findUniqueOrThrow({ where: { id: shareholderId } }),
    getShareholderBalance(shareholderId),
    getTotalSharesOutstanding(),
    prisma.ledgerEntry.findMany({
      where: { shareholderId },
      orderBy: { createdAt: "desc" },
      include: {
        transaction: {
          include: {
            approvals: { where: { shareholderId } },
            correctsTransaction: { select: { id: true, type: true } },
          },
        },
      },
    }),
    getContributionGoal(currentFY),
    prisma.ledgerEntry.aggregate({
      where: {
        transaction: {
          type: TransactionType.CONTRIBUTION,
          createdAt: { gte: yearStart, lt: nextYearStart },
          deleted: false,
        },
      },
      _sum: { shares: true },
    }),
  ]);

  const ownershipPct = total.isZero() ? 0 : balance.div(total).mul(100).toNumber();
  const raisedThisYear = Number(raisedAggregate._sum.shares ?? 0);
  const goalAmount = goal ? Number(goal.amount) : null;
  const progress = goalAmount ? computeGoalProgress(goalAmount, raisedThisYear) : null;

  // QR is rendered server-side to a data URL — no client QR library, and the
  // Venmo link works even with JS disabled.
  const venmo = getVenmoConfig();
  const qrDataUrl = venmo ? await QRCode.toDataURL(venmo.url, { margin: 1, width: 420 }) : null;

  return (
    <div>
      <div
        className="mb-1.5 text-[13px] font-bold tracking-[0.14em] uppercase"
        style={{ color: "var(--color-accent-700)" }}
      >
        Welcome back
      </div>
      <h1 className="mb-5 text-4xl">{shareholder.name}</h1>

      {/* stat cards */}
      <div className="mb-8 flex flex-wrap gap-4">
        <div className="card elev-sm min-w-[240px] flex-1 bg-white px-6 py-6">
          <div className="text-muted text-xs tracking-[0.06em] uppercase">
            Shares currently owned
          </div>
          <div
            className="mt-2 text-[44px] leading-[1.05]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {usd0(Number(balance))}
          </div>
          <div className="text-muted mt-1 text-[13px]">$1 contributed = 1 share</div>
        </div>
        <div
          className="card elev-sm min-w-[240px] flex-1 px-6 py-6"
          style={{ background: "var(--color-accent-2-100)" }}
        >
          <div
            className="text-xs tracking-[0.06em] uppercase"
            style={{ color: "var(--color-accent-2-800)" }}
          >
            Your ownership
          </div>
          <div
            className="mt-2 text-[44px] leading-[1.05]"
            style={{ fontFamily: "var(--font-heading)", color: "var(--color-accent-2-800)" }}
          >
            {ownershipPct.toFixed(1)}%
          </div>
          <div className="mt-1 text-[13px]" style={{ color: "var(--color-accent-2-800)" }}>
            of the lake house
          </div>
        </div>
      </div>

      {/* contribution goal tracker */}
      {(progress || venmo) && (
        <div className="card elev-sm mb-8 bg-white px-6 py-5">
          <div className="mb-3 flex flex-wrap items-center gap-3.5">
            {goalAmount !== null ? (
              <div>
                <div className="text-muted text-xs tracking-[0.06em] uppercase">
                  {fiscalYearLabel(currentFY)} contribution goal
                </div>
                <div className="mt-1 text-[26px]" style={{ fontFamily: "var(--font-heading)" }}>
                  {usd0(raisedThisYear)}{" "}
                  <span className="text-base" style={{ color: "var(--color-neutral-600)" }}>
                    of {usd0(goalAmount)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-muted text-sm">
                No contribution goal set for {fiscalYearLabel(currentFY)} yet.
              </div>
            )}
            {venmo && qrDataUrl && (
              <VenmoDialogButton
                qrDataUrl={qrDataUrl}
                venmoUrl={venmo.url}
                venmoHandle={venmo.handle}
              />
            )}
          </div>
          {progress && (
            <>
              <div
                className="h-3.5 overflow-hidden rounded-full"
                style={{ background: "var(--color-neutral-200)" }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-400 ease-out"
                  style={{ width: `${progress.pct}%`, background: "var(--color-accent-2-500)" }}
                />
              </div>
              <div className="text-muted mt-2 text-[13px]">{progress.note}</div>
            </>
          )}
        </div>
      )}

      <h2 className="mb-3.5 text-[22px]">Your contribution history</h2>
      <div className="flex flex-col gap-3">
        {entries.map((e) => {
          const approval = e.transaction.approvals[0];
          const typeTag = transactionTypeTag(e.transaction.type);
          const shares = Number(e.shares);
          const deleted = e.transaction.deleted;
          return (
            <div
              key={e.id}
              className={`card elev-sm px-5 py-4 ${deleted ? "line-through opacity-60" : ""}`}
              style={{ gap: 8 }}
            >
              {deleted && (
                <div className="text-muted no-underline text-xs">
                  Corrected — excluded from your totals.
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <span className={typeTag.className}>{typeTag.label}</span>
                <span
                  className="ml-0.5 text-lg"
                  style={{
                    fontFamily: "var(--font-heading)",
                    color: shares >= 0 ? "var(--color-accent-2-800)" : "var(--color-accent-800)",
                  }}
                >
                  {shares >= 0 ? "+" : ""}
                  {formatUSD(e.shares.toString())}
                </span>
                <span className="text-muted ml-auto text-[13px]">{formatDate(e.createdAt)}</span>
              </div>
              {e.transaction.description && (
                <div className="text-sm">{e.transaction.description}</div>
              )}
              {e.transaction.correctsTransaction && (
                <div className="text-muted text-xs">
                  Corrects {e.transaction.correctsTransaction.type} transaction #
                  {e.transaction.correctsTransaction.id.slice(-6)}
                </div>
              )}
              {approval && (
                <div>
                  <span
                    className={
                      approval.status === ApprovalStatus.CONFIRMED
                        ? "tag tag-accent-2"
                        : approval.status === ApprovalStatus.DISPUTED
                          ? "tag tag-accent"
                          : "tag tag-outline"
                    }
                  >
                    {approval.status === ApprovalStatus.CONFIRMED
                      ? "Approved"
                      : approval.status === ApprovalStatus.DISPUTED
                        ? "Disputed"
                        : "Pending your approval"}
                  </span>
                  {approval.status === ApprovalStatus.DISPUTED && (
                    <div
                      className="mt-1.5 rounded-2xl px-3.5 py-2.5 text-xs"
                      style={{
                        background: "var(--color-accent-100)",
                        border: "1px solid var(--color-accent-300)",
                        color: "var(--color-accent-900)",
                      }}
                    >
                      <p className="m-0">
                        <span className="font-semibold">Your dispute:</span>{" "}
                        {approval.disputeReason}
                      </p>
                      {approval.resolvedAt ? (
                        <p className="m-0 mt-1" style={{ color: "var(--color-accent-700)" }}>
                          Resolved {formatDate(approval.resolvedAt)}
                          {approval.resolutionTransactionId &&
                            ` — correction #${approval.resolutionTransactionId.slice(-6)}`}
                        </p>
                      ) : (
                        <DisputeEntryActions
                          approvalId={approval.id}
                          disputeReason={approval.disputeReason}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {entries.length === 0 && <p className="text-muted">No contributions yet.</p>}
      </div>
    </div>
  );
}
