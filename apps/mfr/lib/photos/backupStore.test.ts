// Unit: the R2 backup wrapper. The AWS S3 client is mocked; we assert the
// enable-guard and best-effort (never-throw) behavior.

import { afterEach, describe, it, expect, vi } from 'vitest'

const send = vi.fn()
// Class-based mocks: the code uses `new S3Client()` / `new PutObjectCommand()`,
// and an arrow-function mock impl throws "not a constructor" under `new`.
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send(...a: unknown[]) {
      return send(...a)
    }
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  HeadObjectCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
}))

import { backupObject, deleteBackupObject, backupEnabled, healthCheckR2 } from './backupStore'

afterEach(() => {
  send.mockReset()
  delete process.env.BACKUP_ENABLED
})

describe('backupEnabled', () => {
  it('is true only when BACKUP_ENABLED=true', () => {
    expect(backupEnabled()).toBe(false)
    process.env.BACKUP_ENABLED = 'true'
    expect(backupEnabled()).toBe(true)
  })
})

describe('backupObject', () => {
  it('is a no-op when disabled', async () => {
    const ok = await backupObject({ key: 'k', bytes: Buffer.from('x'), contentType: 'image/jpeg' })
    expect(ok).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('uploads when enabled', async () => {
    process.env.BACKUP_ENABLED = 'true'
    send.mockResolvedValue({})
    const ok = await backupObject({ key: 'k', bytes: Buffer.from('x'), contentType: 'image/jpeg' })
    expect(ok).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('swallows failures (never throws)', async () => {
    process.env.BACKUP_ENABLED = 'true'
    send.mockRejectedValue(new Error('r2 down'))
    const ok = await backupObject({ key: 'k', bytes: Buffer.from('x'), contentType: 'image/jpeg' })
    expect(ok).toBe(false)
  })
})

describe('deleteBackupObject', () => {
  it('is a no-op when disabled and deletes when enabled', async () => {
    expect(await deleteBackupObject('k')).toBe(false)
    expect(send).not.toHaveBeenCalled()

    process.env.BACKUP_ENABLED = 'true'
    send.mockResolvedValue({})
    expect(await deleteBackupObject('k')).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('healthCheckR2', () => {
  it('reports ok:true (disabled) without touching R2 when backups are off', async () => {
    const res = await healthCheckR2()
    expect(res).toEqual({ ok: true, detail: 'disabled' })
    expect(send).not.toHaveBeenCalled()
  })

  it('does put → head → delete and returns ok when enabled', async () => {
    process.env.BACKUP_ENABLED = 'true'
    send.mockResolvedValue({})
    const res = await healthCheckR2()
    expect(res).toEqual({ ok: true })
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('returns ok:false with detail when the probe throws', async () => {
    process.env.BACKUP_ENABLED = 'true'
    send.mockRejectedValue(new Error('bad creds'))
    const res = await healthCheckR2()
    expect(res.ok).toBe(false)
    expect(res.detail).toContain('bad creds')
  })
})
