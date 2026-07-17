import { prisma } from "@/lib/accounting/prisma";

/**
 * The single-row app settings. Upsert-read so a fresh database gets the
 * defaults on first touch without a separate bootstrap step.
 */
export async function getAppSettings() {
  return prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}
