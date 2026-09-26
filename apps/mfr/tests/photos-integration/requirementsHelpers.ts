// Area-local helpers for the requirements-*.test.ts files in this suite
// (CAP-013..CAP-019). Each test file must still `vi.mock('@/lib/auth', …)`
// itself; mockUser drives that mock.

import { vi } from 'vitest'
import { auth } from '@/lib/auth'
import { testDb } from './testDb'
import { portalPhotos } from '../../lib/db/schema'

export const ME = '11111111-1111-1111-1111-111111111111'
export const OTHER = '22222222-2222-2222-2222-222222222222'

export function mockUser(
  id: string,
  roles: { siteOwner?: boolean; siteManager?: boolean } = {},
  status: 'approved' | 'pending' = 'approved',
) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id,
      status,
      roles: {
        siteOwner: roles.siteOwner ?? false,
        siteManager: roles.siteManager ?? false,
        accountingManager: false,
      },
      email: `${id}@example.com`,
    },
    expires: '2099-01-01',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

export function photoValues(
  over: Partial<typeof portalPhotos.$inferInsert> = {},
): typeof portalPhotos.$inferInsert {
  const pathname = `gallery/2026/${crypto.randomUUID()}.jpg`
  return {
    year: 2026,
    blobUrl: `https://blob/${pathname}`,
    blobPathname: pathname,
    filename: 'x.jpg',
    byteSize: 1000,
    width: 800,
    height: 600,
    uploadedBy: ME,
    ...over,
  }
}

export async function seedPhoto(over: Partial<typeof portalPhotos.$inferInsert> = {}) {
  const [row] = await testDb.insert(portalPhotos).values(photoValues(over)).returning()
  return row
}
