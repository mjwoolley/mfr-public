// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

// Requirements coverage for CAP-046 (requirements/accounting/shareholder-records.md):
// the Edit screen's one-click Active checkbox and the absence of any delete.

const { setShareholderActive, updateShareholder, findFirst, linkCandidatesMock } = vi.hoisted(
  () => ({
    setShareholderActive: vi.fn(),
    updateShareholder: vi.fn(),
    findFirst: vi.fn(),
    linkCandidatesMock: vi.fn(),
  }),
)

vi.mock('@/actions/accounting/shareholders', () => ({
  setShareholderActive,
  updateShareholder,
  linkShareholderToUser: vi.fn(),
  unlinkShareholder: vi.fn(),
}))
vi.mock('@/lib/db/client', () => ({ db: { query: { shareholder: { findFirst } } } }))
vi.mock('@/lib/accounting/linkCandidates', () => ({ getLinkCandidates: linkCandidatesMock }))
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))

import { EditShareholderForm } from './edit-shareholder-form'
import EditShareholderPage from './page'

const ann = {
  id: 'sh-ann',
  name: 'Ann Miller',
  email: 'ann@family.org',
  active: true,
  userId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

beforeEach(() => {
  setShareholderActive.mockResolvedValue(undefined)
  findFirst.mockResolvedValue(ann)
  linkCandidatesMock.mockResolvedValue({ byId: new Map(), unlinked: [] })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const activeBox = () => screen.getByRole('checkbox', { name: 'Active' }) as HTMLInputElement

describe('CAP-046 Shareholder records — Edit screen', () => {
  it('CAP-046 · Admin deactivates a shareholder — clearing "Active" saves with no further step', async () => {
    render(<EditShareholderForm shareholder={ann} />)
    expect(activeBox().checked).toBe(true)

    fireEvent.click(activeBox())

    await waitFor(() => expect(setShareholderActive).toHaveBeenCalledWith('sh-ann', false))
    expect(setShareholderActive).toHaveBeenCalledTimes(1)
    expect(updateShareholder).not.toHaveBeenCalled()
    expect(activeBox().checked).toBe(false)
  })

  it('CAP-046 · Admin reactivates a shareholder — ticking "Active" saves it', async () => {
    render(<EditShareholderForm shareholder={{ ...ann, active: false }} />)
    expect(activeBox().checked).toBe(false)

    fireEvent.click(activeBox())

    await waitFor(() => expect(setShareholderActive).toHaveBeenCalledWith('sh-ann', true))
    expect(activeBox().checked).toBe(true)
  })

  it("CAP-046 · A shareholder record can't be deleted — no delete control, but it can be deactivated", async () => {
    render(await EditShareholderPage({ params: Promise.resolve({ id: 'sh-ann' }) }))

    expect(screen.getByRole('heading', { name: 'Edit shareholder' })).toBeTruthy()
    expect(screen.queryAllByRole('button', { name: /delete|remove/i })).toHaveLength(0)
    expect(screen.queryByText(/delete/i)).toBeNull()
    expect(activeBox()).toBeTruthy()
  })
})
