import { redirect } from "next/navigation";
import { canAdminAccounting } from "@mfr/auth";
import { requireAuthorized } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getAllShareholderBalances } from "@/lib/ledger";
import { getAppSettings } from "@/lib/settings";
import { TransactionType } from "@/generated/prisma/client";
import {
  contributionTotalsByYear,
  groupEntriesByShareholder,
  groupEntriesByYear,
  type ContributionEntryRow,
  type ShareholderBalanceRow,
} from "./contributionsGrouping";
import { ContributionsClient } from "./contributions-client";
import { FiscalYearNote } from "@/components/FiscalYearNote";

const usd0 = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default async function ContributionsPage() {
  const session = await requireAuthorized();

  // Visibility gate: when the admin toggle is "Admins only", non-admin
  // shareholders don't get this tab (the nav already hides it; this covers
  // direct URLs).
  const settings = await getAppSettings();
  if (!settings.contributionsVisibleToAll && !canAdminAccounting(session.user.roles)) {
    redirect("/accounting/dashboard");
  }

  const [entries, { rows: balanceRows, total }] = await Promise.all([
    prisma.ledgerEntry.findMany({
      include: { transaction: true, shareholder: true },
    }),
    getAllShareholderBalances(),
  ]);

  const rows: ContributionEntryRow[] = entries.map((e) => ({
    shareholderId: e.shareholderId,
    shareholderName: e.shareholder.name,
    type: e.transaction.type,
    date: e.transaction.createdAt.toISOString(),
    description: e.transaction.description,
    amount: Number(e.shares),
    deleted: e.transaction.deleted,
  }));

  const balances: ShareholderBalanceRow[] = balanceRows.map((r) => ({
    shareholderId: r.shareholder.id,
    name: r.shareholder.name,
    balance: Number(r.shares),
    pct: Number(r.percent),
  }));

  const perShareholder = groupEntriesByShareholder(rows, balances);
  const perYear = groupEntriesByYear(rows);

  // Shares sold by year (CONTRIBUTION entries only).
  const totalsByYear = contributionTotalsByYear(rows);
  const years = [...totalsByYear.keys()].sort((a, b) => a - b);
  const maxYearTotal = Math.max(1, ...totalsByYear.values());

  const totalContrib = rows
    .filter((r) => r.type === TransactionType.CONTRIBUTION && !r.deleted)
    .reduce((sum, r) => sum + r.amount, 0);
  const adjTotal = rows
    .filter((r) => r.type === TransactionType.ADJUSTMENT && !r.deleted)
    .reduce((sum, r) => sum + r.amount, 0);

  const summary =
    years.length === 0
      ? "No contributions recorded yet."
      : `${usd0(totalContrib)} raised in contributions since ${years[0]}, plus ${usd0(adjTotal)} in reconciling adjustments — ${usd0(Number(total))} in shares outstanding today.`;

  return (
    <div>
      <h1 className="mb-2 text-4xl">Contributions</h1>
      <p className="text-muted mb-1.5 max-w-[70ch] text-[15px]">{summary}</p>
      <FiscalYearNote />

      {years.length > 0 && (
        <div className="card elev-sm mb-8 bg-white px-6 py-5">
          <h2 className="mb-1 text-xl">Shares sold by year</h2>
          <p className="text-muted mb-3 text-[13px]">
            Every dollar contributed is one share. The founding year raised the down payment.
          </p>
          <div className="flex flex-col gap-[3px]">
            {years.map((year) => {
              const value = totalsByYear.get(year) ?? 0;
              const w = Math.max(1, (value / maxYearTotal) * 100);
              return (
                <div
                  key={year}
                  className="flex items-center gap-2.5"
                  title={`${year} — ${usd0(value)}`}
                >
                  <div className="text-muted w-[34px] flex-none text-right text-[11px] font-semibold">
                    {year}
                  </div>
                  <div className="flex-1">
                    <div
                      className="h-[10px]"
                      style={{
                        width: `${w}%`,
                        background: "var(--color-accent-2-400)",
                        borderRadius: "0 3px 3px 0",
                      }}
                    />
                  </div>
                  <div
                    className="w-[70px] flex-none text-right text-[11px] font-bold"
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--color-accent-2-800)",
                    }}
                  >
                    {usd0(value)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ContributionsClient
        perShareholder={perShareholder}
        perYear={perYear}
        currentShareholderId={session.user.shareholderId ?? null}
      />
    </div>
  );
}
