import { prisma } from "@/lib/prisma";
import { TransferForm } from "./transfer-form";

export default async function NewTransferPage() {
  const shareholders = await prisma.shareholder.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold">Record a transfer</h1>
      <p className="mt-2 text-stone-600">
        Moves shares from one shareholder to another. Both are emailed and it&apos;s reflected in
        both balances immediately.
      </p>
      <TransferForm shareholders={shareholders} />
    </div>
  );
}
