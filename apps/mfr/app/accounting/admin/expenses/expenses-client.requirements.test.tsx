// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ExpensesAdminClient, type ExpenseRow } from './expenses-client'

// Requirements coverage for CAP-044 (requirements/accounting/expense-log.md):
// the admin Expenses view's dialogs, defaults, confirmation text and empty state.

const { createExpense, updateExpense, deleteExpense } = vi.hoisted(() => ({
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
}))
vi.mock('@/actions/accounting/expenses', () => ({ createExpense, updateExpense, deleteExpense }))

beforeEach(() => {
  createExpense.mockResolvedValue({ success: true })
  updateExpense.mockResolvedValue({ success: true })
  deleteExpense.mockResolvedValue({ success: true })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const propertyTax: ExpenseRow = {
  id: 'exp-1',
  description: 'County property tax',
  amount: 1250,
  amountFmt: '$1,250',
  category: 'TAXES',
  categoryLabel: 'Taxes',
  categoryClassName: 'tag tag-neutral',
  capital: false,
  dateFmt: 'Sep 1, 2026',
}

const roofRepair: ExpenseRow = {
  id: 'exp-2',
  description: 'Roof patch',
  amount: 900,
  amountFmt: '$900',
  category: 'REPAIRS',
  categoryLabel: 'Repairs',
  categoryClassName: 'tag tag-accent',
  capital: true,
  dateFmt: 'Feb 27, 2026',
}

const dialog = () => document.querySelector('dialog') as HTMLDialogElement | null

function historyRow(description: string) {
  return screen.getByText(description).closest('.txcard') as HTMLElement
}

describe('CAP-044 Expense log — admin view', () => {
  it('CAP-044 · Admin records an expense — the dialog submits the entered details and closes', async () => {
    render(<ExpensesAdminClient rows={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record expense' }))
    const d = dialog()!
    expect(within(d).getByText('Record expense', { selector: '.dialog-title' })).toBeTruthy()

    fireEvent.change(within(d).getByLabelText('Description'), {
      target: { value: 'County property tax' },
    })
    fireEvent.change(within(d).getByLabelText('Amount ($)'), { target: { value: '1250.00' } })
    fireEvent.change(within(d).getByLabelText('Date incurred'), {
      target: { value: '2026-09-01' },
    })
    fireEvent.change(within(d).getByLabelText('Category'), { target: { value: 'TAXES' } })
    // happy-dom doesn't turn a submit-button click into a submit event React's
    // form-action handler sees, so the submit is dispatched on the form.
    fireEvent.submit(d.querySelector('form')!)

    await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1))
    const submitted = createExpense.mock.calls[0][1] as FormData
    expect(Object.fromEntries(submitted.entries())).toMatchObject({
      description: 'County property tax',
      amount: '1250.00',
      incurredAt: '2026-09-01',
      category: 'TAXES',
      capital: 'false',
    })
    await waitFor(() => expect(dialog()).toBeNull())
  })

  it('CAP-044 · Admin records an expense — the history row shows the amount and date', () => {
    render(<ExpensesAdminClient rows={[propertyTax]} />)

    const row = historyRow('County property tax')
    expect(within(row).getByText('$1,250')).toBeTruthy()
    expect(within(row).getByText('Sep 1, 2026')).toBeTruthy()
  })

  it('CAP-044 · A new expense starts as an operating repair', () => {
    render(<ExpensesAdminClient rows={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record expense' }))
    const d = dialog()!

    const category = within(d).getByLabelText('Category') as HTMLSelectElement
    expect(category.value).toBe('REPAIRS')
    expect(category.selectedOptions[0].textContent).toBe('Repairs')
    expect((within(d).getByLabelText('Operating') as HTMLInputElement).checked).toBe(true)
    expect((within(d).getByLabelText('Capital investment') as HTMLInputElement).checked).toBe(false)
    expect((d.querySelector('input[name="capital"]') as HTMLInputElement).value).toBe('false')
  })

  it('CAP-044 · Expense categories', () => {
    render(<ExpensesAdminClient rows={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record expense' }))

    const options = [...(within(dialog()!).getByLabelText('Category') as HTMLSelectElement).options]
    expect(options.map((o) => o.textContent)).toEqual([
      'Taxes',
      'Insurance',
      'Utilities',
      'Furnishings',
      'Repairs',
      'Improvements',
      'Other',
    ])
  })

  it('CAP-044 · Capital investment is chosen separately from the category', async () => {
    const { unmount } = render(<ExpensesAdminClient rows={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record expense' }))
    const d = dialog()!
    fireEvent.change(within(d).getByLabelText('Description'), { target: { value: 'Roof patch' } })
    fireEvent.change(within(d).getByLabelText('Amount ($)'), { target: { value: '900' } })
    fireEvent.change(within(d).getByLabelText('Date incurred'), {
      target: { value: '2026-02-27' },
    })
    fireEvent.click(within(d).getByLabelText('Capital investment'))
    fireEvent.submit(d.querySelector('form')!)

    await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1))
    const submitted = Object.fromEntries((createExpense.mock.calls[0][1] as FormData).entries())
    // The category stays "Repairs"; capital is a separate flag.
    expect(submitted).toMatchObject({ category: 'REPAIRS', capital: 'true' })
    unmount()

    // Shown with its Repairs category and a Capital tag.
    render(<ExpensesAdminClient rows={[roofRepair]} />)
    const row = historyRow('Roof patch')
    expect(within(row).getByText('Repairs').className).toBe('tag tag-accent flex-none')
    expect(within(row).getByText('Capital')).toBeTruthy()
  })

  it("CAP-044 · An expense's date can't be changed by editing", () => {
    render(<ExpensesAdminClient rows={[roofRepair]} />)
    fireEvent.click(within(historyRow('Roof patch')).getByRole('button', { name: 'Edit' }))
    const d = dialog()!

    const date = within(d).getByLabelText('Date incurred') as HTMLInputElement
    expect(date.value).toBe('Feb 27, 2026')
    expect(date.disabled).toBe(true)
    // Not a named field, so the date is never submitted with the edit.
    expect(date.getAttribute('name')).toBeNull()
    expect(d.querySelector('[name="incurredAt"]')).toBeNull()
    expect(
      within(d).getByText('Edits keep the original date, so the expense stays in its year.'),
    ).toBeTruthy()
  })

  it('CAP-044 · Deleting an expense asks for confirmation', () => {
    render(<ExpensesAdminClient rows={[propertyTax]} />)
    fireEvent.click(
      within(historyRow('County property tax')).getByRole('button', { name: 'Delete' }),
    )
    const d = dialog()!

    expect(d.querySelector('p')!.textContent).toBe(
      'Delete County property tax — $1,250 on Sep 1, 2026?',
    )
    expect(
      within(d).getByText(
        'This permanently removes it from the expense log and the income/expense report.',
      ),
    ).toBeTruthy()
    expect(within(d).getByRole('button', { name: 'Delete expense' })).toBeTruthy()
    expect(within(d).getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(deleteExpense).not.toHaveBeenCalled()
  })

  it('CAP-044 · Cancelling a delete keeps the expense', () => {
    render(<ExpensesAdminClient rows={[propertyTax]} />)
    fireEvent.click(
      within(historyRow('County property tax')).getByRole('button', { name: 'Delete' }),
    )
    fireEvent.click(within(dialog()!).getByRole('button', { name: 'Cancel' }))

    expect(dialog()).toBeNull()
    expect(deleteExpense).not.toHaveBeenCalled()
    expect(historyRow('County property tax')).toBeTruthy()
  })

  it('CAP-044 · No expenses yet', () => {
    render(<ExpensesAdminClient rows={[]} />)

    expect(screen.getByText('No expenses recorded yet.')).toBeTruthy()
  })

  it('CAP-044 · No expenses yet — not shown once an expense exists', () => {
    render(<ExpensesAdminClient rows={[propertyTax]} />)

    expect(screen.queryByText('No expenses recorded yet.')).toBeNull()
  })
})
