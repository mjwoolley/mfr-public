import { prisma } from "@/lib/prisma";
import { AdjustmentForm } from "./adjustment-form";

export default async function NewAdjustmentPage() {
  const shareholders = await prisma.shareholder.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold">Record a balance adjustment</h1>
      <p className="mt-2 text-stone-600">
        For fixing data-entry mistakes that aren&apos;t tied to a specific contribution. The
        shareholder is emailed and it&apos;s reflected immediately.
      </p>
      <AdjustmentForm shareholders={shareholders} />
    </div>
  );
}
