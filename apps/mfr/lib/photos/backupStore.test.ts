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
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
}))

import { backupObject, deleteBackupObject, backupEnabled } from './backupStore'

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
