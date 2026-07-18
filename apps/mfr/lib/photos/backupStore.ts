// Off-provider durability for photo blobs: mirror each stored image to an
// independent Cloudflare R2 bucket (S3-compatible). Mirrors the SES pattern in
// lib/reservations/email.ts — lazy singleton client, custom-prefixed env names
// (Vercel reserves the AWS_* names for its own runtime), a prod-only enable
// guard, and failures that are logged, never thrown. Mocked in tests.

import crypto from 'node:crypto'
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { logger } from '@/lib/reservations/logger'

let client: S3Client | null = null

function getClient() {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: process.env.R2_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
          }
        : undefined,
    })
  }
  return client
}

/** Real backups only run where explicitly enabled (production), mirroring the
 * EMAIL_ENABLED guard so local/test never write to R2. */
export function backupEnabled() {
  return process.env.BACKUP_ENABLED === 'true'
}

/** Mirror one object to R2. Best-effort: returns false (logged) on any failure
 * or when backups are disabled, so the caller never fails a user's upload. */
export async function backupObject(opts: {
  key: string
  bytes: Buffer
  contentType: string
}): Promise<boolean> {
  if (!backupEnabled()) return false
  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: opts.key,
        Body: opts.bytes,
        ContentType: opts.contentType,
      }),
    )
    return true
  } catch (error) {
    logger.error({ error, key: opts.key }, 'R2 backup upload failed')
    return false
  }
}

/** Delete one object from R2 (used by the retention purge). Best-effort. */
export async function deleteBackupObject(key: string): Promise<boolean> {
  if (!backupEnabled()) return false
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }))
    return true
  } catch (error) {
    logger.error({ error, key }, 'R2 backup delete failed')
    return false
  }
}

/** Non-destructive credential/bucket probe for the health endpoint: put → head →
 * delete a throwaway object. Returns { ok:true, detail:'disabled' } when backups
 * are off so preview envs (no R2 creds) don't report a false failure. */
export async function healthCheckR2(): Promise<{ ok: boolean; detail?: string }> {
  if (!backupEnabled()) return { ok: true, detail: 'disabled' }
  const key = `health/probe-${crypto.randomUUID()}.txt`
  try {
    const client = getClient()
    const Bucket = process.env.R2_BUCKET
    await client.send(
      new PutObjectCommand({
        Bucket,
        Key: key,
        Body: Buffer.from('ok'),
        ContentType: 'text/plain',
      }),
    )
    await client.send(new HeadObjectCommand({ Bucket, Key: key }))
    await client.send(new DeleteObjectCommand({ Bucket, Key: key }))
    return { ok: true }
  } catch (error) {
    logger.error({ error }, 'R2 health check failed')
    return { ok: false, detail: (error as Error).message }
  }
}
