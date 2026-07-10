"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireShareholder } from "@/lib/authz";

export async function approveTransaction(approvalId: string) {
  const session = await requireShareholder();

  // Scope the update to the current shareholder's own approval row so nobody
  // can approve on another shareholder's behalf via a crafted request.
  await prisma.transactionApproval.updateMany({
    where: {
      id: approvalId,
      shareholderId: session.user.shareholderId,
      approvedAt: null,
    },
    data: { approvedAt: new Date() },
  });

  revalidatePath("/accounting/inbox");
}
