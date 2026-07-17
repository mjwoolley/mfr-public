// The NextAuth catch-all route is a bare re-export of the shared handlers —
// this pins that wiring (and keeps the routes coverage glob honest).
import { describe, expect, it, vi } from 'vitest'

const handlers = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }))
vi.mock('@/lib/auth/config', () => ({ handlers }))

import { GET, POST } from './[...nextauth]/route'

describe('auth route', () => {
  it('re-exports the shared NextAuth handlers', () => {
    expect(GET).toBe(handlers.GET)
    expect(POST).toBe(handlers.POST)
  })
})
