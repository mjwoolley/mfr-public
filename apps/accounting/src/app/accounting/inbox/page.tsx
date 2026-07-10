import { requireShareholder } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { formatUSD, formatDate } from "@/lib/format";
import { approveTransaction } from "@/actions/approvals";

export default async function InboxPage() {
  const session = await requireShareholder();

  const pending = await prisma.transactionApproval.findMany({
    where: { shareholderId: session.user.shareholderId, approvedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      transaction: {
        include: {
          entries: { where: { shareholderId: session.user.shareholderId } },
        },
      },
    },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold">Inbox</h1>
      <p className="mt-2 text-black/60 dark:text-white/60">
        These are already reflected in your balance. Approving just confirms you&apos;ve seen
        them — it doesn&apos;t change anything.
      </p>

      <ul className="mt-6 flex flex-col gap-4">
        {pending.map((approval) => {
          const entry = approval.transaction.entries[0];
          const recordedBy =
            approval.transaction.createdByName ?? approval.transaction.createdByEmail ?? "an admin";
          return (
            <li
              key={approval.id}
              className="rounded border border-black/10 p-4 text-sm dark:border-white/10"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{approval.transaction.type}</span>
                <span className="text-black/50 dark:text-white/50">
                  {formatDate(approval.transaction.createdAt)}
                </span>
              </div>
              {entry && (
                <p className="mt-1">
                  {Number(entry.shares) >= 0 ? "+" : ""}
                  {formatUSD(entry.shares.toString())} shares
                </p>
              )}
              {approval.transaction.description && (
                <p className="mt-1">{approval.transaction.description}</p>
              )}
              <p className="mt-1 text-black/40 dark:text-white/40">
                Recorded by {recordedBy}
              </p>
              <form
                action={async () => {
                  "use server";
                  await approveTransaction(approval.id);
                }}
              >
                <button
                  type="submit"
                  className="mt-3 rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background"
                >
                  Approve
                </button>
              </form>
            </li>
          );
        })}
        {pending.length === 0 && (
          <li className="text-black/50 dark:text-white/50">Nothing pending.</li>
        )}
      </ul>
    </div>
  );
}
