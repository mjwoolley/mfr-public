import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatUSD, formatDate } from "@/lib/format";
import { CorrectionForm } from "./correction-form";

export default async function CorrectTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const original = await prisma.transaction.findUnique({
    where: { id },
    include: { entries: { include: { shareholder: true } } },
  });
  if (!original) notFound();

  return (
    <div>
      <h1 className="text-xl font-semibold">Correct transaction</h1>

      <div className="mt-4 rounded border border-black/10 p-4 text-sm dark:border-white/10">
        <div className="flex items-center justify-between">
          <span className="font-medium">{original.type}</span>
          <span className="text-black/50 dark:text-white/50">{formatDate(original.createdAt)}</span>
        </div>
        {original.description && <p className="mt-1">{original.description}</p>}
        <ul className="mt-2 flex flex-col gap-1">
          {original.entries.map((e) => (
            <li key={e.id}>
              {e.shareholder.name}: {Number(e.shares) >= 0 ? "+" : ""}
              {formatUSD(e.shares.toString())} shares
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-black/60 dark:text-white/60">
        This original entry can&apos;t be edited or deleted. The amounts below default to a full
        reversal — adjust them if this is a partial correction.
      </p>

      <CorrectionForm
        originalTransactionId={original.id}
        entries={original.entries.map((e) => ({
          shareholderId: e.shareholderId,
          shareholderName: e.shareholder.name,
          originalShares: e.shares.toString(),
        }))}
      />
    </div>
  );
}
