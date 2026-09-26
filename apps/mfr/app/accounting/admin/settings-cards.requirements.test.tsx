// @vitest-environment happy-dom
// Requirement coverage for the two standing admin controls (CAP-038 ledger
// visibility, CAP-041 the fiscal-year goal). The server actions are spies;
// what they store is covered in tests/accounting-integration/adminSettings.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/actions/accounting/settings', () => ({ setContributionsVisibility: vi.fn() }))
vi.mock('@/actions/accounting/goals', () => ({ setContributionGoal: vi.fn() }))

import { AdminSettingsCards } from './settings-cards'
import { setContributionsVisibility } from '@/actions/accounting/settings'
import { setContributionGoal } from '@/actions/accounting/goals'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(setContributionsVisibility).mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('CAP-038 Share purchases ledger — visibility setting', () => {
  it('CAP-038 · An admin makes the ledger admins-only', async () => {
    const { rerender } = render(
      <AdminSettingsCards contributionsVisibleToAll currentFiscalYear={2026} goalAmount={null} />,
    )

    fireEvent.click(screen.getByLabelText('Admins only'))
    await waitFor(() => expect(setContributionsVisibility).toHaveBeenCalledWith(false))

    // After the save the page re-renders with the stored setting.
    rerender(
      <AdminSettingsCards
        contributionsVisibleToAll={false}
        currentFiscalYear={2026}
        goalAmount={null}
      />,
    )
    expect(
      screen.getByText(
        'Only admins can open the Share purchases tab. Shareholders still see their dashboard, ownership and expenses.',
      ),
    ).toBeTruthy()
    expect((screen.getByLabelText('Admins only') as HTMLInputElement).checked).toBe(true)
  })
})

describe('CAP-041 Share purchase goal — the form', () => {
  it('CAP-041 · An admin sets the goal for a fiscal year', async () => {
    vi.mocked(setContributionGoal).mockResolvedValue({ saved: true })
    render(
      <AdminSettingsCards contributionsVisibleToAll currentFiscalYear={2026} goalAmount={null} />,
    )

    expect(screen.getByText('Fiscal-year share purchase goal')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Fiscal year'), { target: { value: '2026' } })
    fireEvent.change(screen.getByLabelText('Goal (shares)'), { target: { value: '20000' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Save goal' }).closest('form')!)

    await waitFor(() => expect(screen.getByText('Saved.')).toBeTruthy())
    const posted = vi.mocked(setContributionGoal).mock.calls[0][1] as FormData
    expect(posted.get('year')).toBe('2026')
    expect(posted.get('amount')).toBe('20000')
  })

  it('CAP-041 · A goal must be above zero (message shown)', async () => {
    vi.mocked(setContributionGoal).mockResolvedValue({ error: 'Goal must be greater than zero' })
    render(
      <AdminSettingsCards contributionsVisibleToAll currentFiscalYear={2026} goalAmount={null} />,
    )

    fireEvent.change(screen.getByLabelText('Goal (shares)'), { target: { value: '0' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Save goal' }).closest('form')!)

    await waitFor(() => expect(screen.getByText('Goal must be greater than zero')).toBeTruthy())
    expect(screen.queryByText('Saved.')).toBeNull()
  })
})
