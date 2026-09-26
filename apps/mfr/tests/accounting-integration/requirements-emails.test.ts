// Requirement coverage, against the real test DB, for the notification each
// record action sends (CAP-039): exact subjects, the reason, and reply-to the
// recording admin. sendEmail is the mocked boundary, as in emails.test.ts.
//
// Deliberately NOT asserted: the rendered amount wording of transfer /
// adjustment / correction emails ("25 shares shares" — CAP-039 open question).
import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/email', () => ({ sendEmail: vi.fn(), appUrl: (p: string) => p }))

import { auth } from '@/lib/auth'
import { sendEmail } from '@/lib/accounting/email'
import {
  adminSession,
  fd,
  makeShareholder,
  transactionsFor,
  cleanupFixtures,
} from './requirementsFixtures'
import { createContribution } from '@/actions/accounting/contributions'
import { createAdjustment } from '@/actions/accounting/adjustments'
import { createCorrection } from '@/actions/accounting/corrections'

afterEach(async () => {
  vi.mocked(auth).mockReset()
  vi.mocked(sendEmail).mockReset()
  await cleanupFixtures()
})

/** The one email sent, reduced to what the scenarios name. */
function onlyEmail() {
  expect(sendEmail).toHaveBeenCalledTimes(1)
  const { to, subject, replyTo, react } = vi.mocked(sendEmail).mock.calls[0][0]
  const props = react.props as { description?: string; shares?: string; adminName?: string }
  return { to, subject, replyTo, description: props.description, adminName: props.adminName }
}

describe('CAP-039 Ledger email notifications — what each action sends', () => {
  it('CAP-039 · A share purchase is emailed to the shareholder', async () => {
    const sh = await makeShareholder('Dana Brown', { email: true })
    vi.mocked(auth).mockResolvedValue(adminSession())

    await createContribution(undefined, fd({ shareholderId: sh.id, amount: '500' }))

    expect(onlyEmail()).toEqual({
      to: sh.email,
      subject: 'Share purchase of 500 shares recorded',
      replyTo: 'ada.admin@example.com',
      description: null,
      adminName: 'Ada Admin',
    })
  })

  it.each([
    ['an adjustment', 'Balance adjustment of 25 shares recorded'],
    ['a correction', 'Correction of -90 shares recorded'],
  ])(
    'CAP-039 · Adjustments and corrections are emailed with their reason (%s)',
    async (what, subject) => {
      const sh = await makeShareholder('Dana Brown', { email: true })
      vi.mocked(auth).mockResolvedValue(adminSession())
      if (what === 'an adjustment') {
        await createAdjustment(
          undefined,
          fd({ shareholderId: sh.id, amount: '25', description: 'reconcile 2019 import' }),
        )
      } else {
        await createContribution(undefined, fd({ shareholderId: sh.id, amount: '100' }))
        const [original] = await transactionsFor(sh.id)
        vi.mocked(sendEmail).mockClear()
        await createCorrection(
          undefined,
          fd({
            originalTransactionId: original.id,
            description: 'reconcile 2019 import',
            [`amount_${sh.id}`]: '-90',
          }),
        )
      }

      // Replies reach the recording admin for these too.
      expect(onlyEmail()).toEqual({
        to: sh.email,
        subject,
        replyTo: 'ada.admin@example.com',
        description: 'reconcile 2019 import',
        adminName: 'Ada Admin',
      })
    },
  )
})
