import { requireShareholder } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getShareholderBalance } from "@/lib/ledger";
import { formatUSD, formatDate } from "@/lib/format";
import { ApprovalStatus } from "@/generated/prisma/client";

export default async function DashboardPage() {
  const session = await requireShareholder();
  const shareholderId = session.user.shareholderId;

  const [shareholder, balance, entries] = await Promise.all([
    prisma.shareholder.findUniqueOrThrow({ where: { id: shareholderId } }),
    getShareholderBalance(shareholderId),
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
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold">Welcome, {shareholder.name}</h1>
      <p className="mt-2 text-3xl font-semibold">{formatUSD(balance.toString())}</p>
      <p className="text-stone-600">shares currently owned</p>

      <h2 className="mt-8 text-lg font-semibold">Contribution history</h2>
      <ul className="mt-4 flex flex-col gap-3">
        {entries.map((e) => {
          const approval = e.transaction.approvals[0];
          return (
            <li
              key={e.id}
              className="rounded border border-sand-200 p-4 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{e.transaction.type}</span>
                <span className="text-stone-500">
                  {formatDate(e.createdAt)}
                </span>
              </div>
              <p className="mt-1">
                {Number(e.shares) >= 0 ? "+" : ""}
                {formatUSD(e.shares.toString())} shares
              </p>
              {e.transaction.description && <p className="mt-1">{e.transaction.description}</p>}
              {e.transaction.correctsTransaction && (
                <p className="mt-1 text-stone-500">
                  Corrects {e.transaction.correctsTransaction.type} transaction #
                  {e.transaction.correctsTransaction.id.slice(-6)}
                </p>
              )}
              {approval && (
                <span
                  className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs ${
                    approval.status === ApprovalStatus.CONFIRMED
                      ? "bg-green-100 text-green-800"
                      : approval.status === ApprovalStatus.DISPUTED
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {approval.status === ApprovalStatus.CONFIRMED
                    ? "Confirmed"
                    : approval.status === ApprovalStatus.DISPUTED
                      ? "Disputed"
                      : "Pending your confirmation"}
                </span>
              )}
            </li>
          );
        })}
        {entries.length === 0 && (
          <li className="text-stone-500">No contributions yet.</li>
        )}
      </ul>
    </div>
  );
}
