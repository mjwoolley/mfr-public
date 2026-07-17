"use server";

// Admin action for the AppSettings singleton (currently just the
// Contributions-tab visibility toggle).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";

/**
 * Flips the Contributions-tab visibility (Everyone vs Admins-only). The tab
 * row and the contributions page both read this on every request, so the
 * change takes effect immediately for all shareholders.
 */
export async function setContributionsVisibility(visibleToAll: boolean): Promise<void> {
  await requireAdmin();

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: { contributionsVisibleToAll: visibleToAll },
    create: { id: "singleton", contributionsVisibleToAll: visibleToAll },
  });

  // The tab row renders on every page; revalidate the app root so the
  // Contributions tab appears/disappears without a hard refresh.
  revalidatePath("/accounting", "layout");
}
