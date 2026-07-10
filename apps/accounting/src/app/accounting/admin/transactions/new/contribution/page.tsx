import { prisma } from "@/lib/prisma";
import { ContributionForm } from "./contribution-form";

export default async function NewContributionPage() {
  const shareholders = await prisma.shareholder.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold">Record a contribution</h1>
      <p className="mt-2 text-stone-600">
        $1 = 1 share. The shareholder will be emailed and it&apos;ll show up in their history
        immediately.
      </p>
      <ContributionForm shareholders={shareholders} />
    </div>
  );
}
