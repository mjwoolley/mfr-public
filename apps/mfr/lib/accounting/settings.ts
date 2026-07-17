import { db } from "@/lib/db/client";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * The single-row app settings. Read-with-default so a fresh database gets the
 * defaults on first touch without a separate bootstrap step.
 */
export async function getAppSettings() {
  const existing = await db.query.appSettings.findFirst({
    where: eq(appSettings.id, "singleton"),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(appSettings)
    .values({ id: "singleton", updatedAt: new Date() })
    .returning();
  return created;
}
