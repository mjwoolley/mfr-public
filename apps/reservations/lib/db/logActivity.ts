import type { db as Db } from './client'
import { activityLog } from './schema'

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0]

export async function logActivity(
  tx: Tx,
  params: { eventType: string; actorUserId: string | null; metadata?: Record<string, unknown> },
) {
  await tx.insert(activityLog).values({
    eventType: params.eventType,
    actorUserId: params.actorUserId,
    metadata: params.metadata ?? {},
  })
}
