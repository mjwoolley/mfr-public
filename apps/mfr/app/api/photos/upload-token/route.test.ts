// Unit: the client-upload token route. @vercel/blob/client.handleUpload and the
// auth gate are mocked; we assert the gate runs and the token constraints
// (content types incl. HEIC, size cap) are returned, and that an unauthorized
// caller yields a 400.

import { afterEach, describe, it, expect, vi } from 'vitest'
import { MAX_UPLOAD_BYTES } from '@/lib/photos/constants'

const requireApproved = vi.fn()
vi.mock('@/lib/authz', () => ({ requireApproved: (...a: unknown[]) => requireApproved(...a) }))

const handleUpload = vi.fn()
vi.mock('@vercel/blob/client', () => ({ handleUpload: (...a: unknown[]) => handleUpload(...a) }))

import { POST } from './route'

type HandleUploadArg = {
  onBeforeGenerateToken: (
    pathname: string,
    clientPayload: string | null,
    multipart: boolean,
  ) => Promise<{ allowedContentTypes?: string[]; maximumSizeInBytes?: number }>
}

function jsonReq() {
  return new Request('https://x/api/photos/upload-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'blob.generate-client-token' }),
  })
}

afterEach(() => {
  requireApproved.mockReset()
  handleUpload.mockReset()
})

describe('POST /api/photos/upload-token', () => {
  it('gates on requireApproved and returns HEIC-inclusive, size-capped token config', async () => {
    requireApproved.mockResolvedValue({ user: { id: 'u1' } })
    handleUpload.mockImplementation(async ({ onBeforeGenerateToken }: HandleUploadArg) => {
      const cfg = await onBeforeGenerateToken('gallery-tmp/a.jpg', null, false)
      return { type: 'token', cfg }
    })

    const res = await POST(jsonReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(requireApproved).toHaveBeenCalledTimes(1)
    expect(body.cfg.allowedContentTypes).toContain('image/heic')
    expect(body.cfg.maximumSizeInBytes).toBe(MAX_UPLOAD_BYTES)
  })

  it('returns 400 when the caller is not approved', async () => {
    requireApproved.mockRejectedValue(new Error('redirect'))
    handleUpload.mockImplementation(async ({ onBeforeGenerateToken }: HandleUploadArg) => {
      await onBeforeGenerateToken('gallery-tmp/a.jpg', null, false)
      return { type: 'token' }
    })

    const res = await POST(jsonReq())
    expect(res.status).toBe(400)
  })
})
