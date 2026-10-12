// Requirement coverage for CAP-039 "An email failure never undoes the entry",
// end to end through the real sendEmail: SES itself is mocked to fail, sending
// is switched on, and the record actions must still succeed and leave their
// transaction on the ledger.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

const { sesSend } = vi.hoisted(() => ({ sesSend: vi.fn() }))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: class {
    send = sesSend
  },
  SendEmailCommand: class {
    constructor(public input: unknown) {}
  },
}))

import { auth } from '@/lib/auth'
import {
  adminSession,
  fd,
  makeShareholder,
  transactionsFor,
  cleanupFixtures,
} from './requirementsFixtures'
import { createContribution } from '@/actions/accounting/contributions'
import { createAdjustment } from '@/actions/accounting/adjustments'
import { getShareholderBalance } from '@/lib/accounting/ledger'

beforeEach(() => {
  vi.stubEnv('EMAIL_ENABLED', 'true')
  sesSend.mockRejectedValue(new Error('SES is down'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(auth).mockResolvedValue(adminSession())
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.mocked(auth).mockReset()
  sesSend.mockReset()
  await cleanupFixtures()
})

describe('CAP-039 Ledger email notifications — failures', () => {
  it('CAP-039 · An email failure never undoes the entry (share purchase)', async () => {
    const sh = await makeShareholder('Dana Brown', { email: true })

    const result = await createContribution(undefined, fd({ shareholderId: sh.id, amount: '500' }))

    expect(sesSend).toHaveBeenCalledTimes(1) // the send was really attempted
    expect(result).toEqual({ success: true })
    expect(await transactionsFor(sh.id)).toHaveLength(1)
    expect(Number(await getShareholderBalance(sh.id))).toBe(500)
  })

  it('CAP-039 · An email failure never undoes the entry (adjustment)', async () => {
    const sh = await makeShareholder('Dana Brown', { email: true })

    const result = await createAdjustment(
      undefined,
      fd({ shareholderId: sh.id, amount: '25', description: 'reconcile' }),
    )

    expect(sesSend).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ success: true })
    expect(Number(await getShareholderBalance(sh.id))).toBe(25)
  })
})
