// Admin transactions view (server half): fetches the full transaction list
// with entries/approvals, pre-formats display rows, and passes the active
// shareholders the record dialogs need. `?correct=<id>` deep-links straight
// into the correction dialog for that transaction.

import { db } from "@/lib/db/client";
import { shareholder, transaction } from "@/lib/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { formatDate } from "@/lib/accounting/format";
import { transactionTypeTag, approvalStatusTag } from "@/lib/accounting/tags";
import { TransactionsClient, type TxRow } from "./transactions-client";

const usd0 = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const signed = (n: number) => (n >= 0 ? "+" : "") + usd0(n);

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ correct?: string }>;
}) {
  const { correct } = await searchParams;

  const [transactions, shareholders] = await Promise.all([
    db.query.transaction.findMany({
      orderBy: [desc(transaction.createdAt)],
      with: {
        entries: { with: { shareholder: { columns: { name: true } } } },
        approvals: { with: { shareholder: { columns: { name: true } } } },
        correctsTransaction: { columns: { id: true, type: true } },
      },
    }),
    db.query.shareholder.findMany({
      where: eq(shareholder.active, true),
      orderBy: [asc(shareholder.name)],
      columns: { id: true, name: true },
    }),
  ]);

  const rows: TxRow[] = transactions.map((t) => {
    const typeTag = transactionTypeTag(t.type);
    let entryLine: string;
    if (t.type === "TRANSFER" && t.entries.length === 2) {
      const from = t.entries.find((e) => Number(e.shares) < 0) ?? t.entries[0];
      const to = t.entries.find((e) => Number(e.shares) > 0) ?? t.entries[1];
      entryLine = `${from.shareholder.name} → ${to.shareholder.name} · ${usd0(Math.abs(Number(to.shares)))}`;
    } else {
      entryLine = t.entries
        .map((e) => `${e.shareholder.name} ${signed(Number(e.shares))}`)
        .join(" · ");
    }
    return {
      id: t.id,
      typeLabel: typeTag.label,
      typeClassName: typeTag.className,
      dateFmt: formatDate(t.createdAt),
      description: t.description,
      recordedBy: t.createdByName ?? t.createdByEmail ?? "an admin",
      correctsNote: t.correctsTransaction
        ? `Corrects ${t.correctsTransaction.type} #${t.correctsTransaction.id.slice(-4)}`
        : "",
      deleted: t.deleted,
      entryLine,
      entries: t.entries.map((e) => ({
        shareholderId: e.shareholderId,
        shareholderName: e.shareholder.name,
        shares: Number(e.shares),
      })),
      approvals: t.approvals.map((a) => {
        const tag = approvalStatusTag(a.status);
        return { label: `${a.shareholder.name} · ${tag.label}`, className: tag.className };
      }),
    };
  });

  return (
    <TransactionsClient
      rows={rows}
      shareholders={shareholders}
      initialCorrectId={correct ?? null}
    />
  );
}
