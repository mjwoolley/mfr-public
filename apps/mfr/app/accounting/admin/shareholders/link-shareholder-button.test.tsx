// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { LinkShareholderButton, type LinkCandidate } from './link-shareholder-button'

const linkShareholderToUser = vi.fn()
const unlinkShareholder = vi.fn()
vi.mock('@/actions/accounting/shareholders', () => ({
  linkShareholderToUser: (...a: unknown[]) => linkShareholderToUser(...a),
  unlinkShareholder: (...a: unknown[]) => unlinkShareholder(...a),
}))

// happy-dom doesn't implement <dialog>.showModal(). Reflect the `open`
// attribute the way the real one does — without it the dialog's contents stay
// out of the accessibility tree and every getByRole below would miss them,
// which would also be true for a real screen reader.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false
  })
  linkShareholderToUser.mockResolvedValue(undefined)
  unlinkShareholder.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const CANDIDATES: LinkCandidate[] = [
  { id: 'u-michele', email: 'michele@example.com', name: 'Michele Anderegg', linkedTo: null },
  { id: 'u-bob', email: 'bob@example.com', name: 'Bob Smith', linkedTo: null },
  { id: 'u-taken', email: 'taken@example.com', name: 'Ray Miller', linkedTo: 'Ray Miller' },
]

function open(props: Partial<Parameters<typeof LinkShareholderButton>[0]> = {}) {
  render(
    <LinkShareholderButton
      shareholderId="sh-1"
      shareholderName="John and Michele Anderegg"
      linkedLabel={null}
      candidates={CANDIDATES}
      {...props}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Link' }))
}

function rowFor(name: string) {
  return screen.getByText(name).closest('li') as HTMLElement
}

describe('LinkShareholderButton', () => {
  it('marks the login whose name is contained in the household name as a suggestion', () => {
    open()

    expect(screen.getByText('Suggested')).toBeTruthy()
    expect(within(rowFor('Michele Anderegg')).getByText('Name matches')).toBeTruthy()
    expect(within(rowFor('Bob Smith')).queryByText('Name matches')).toBeNull()
  })

  it('links a suggested match in one click, with no confirmation', async () => {
    open()

    fireEvent.click(within(rowFor('Michele Anderegg')).getByRole('button', { name: 'Link' }))

    await waitFor(() => expect(linkShareholderToUser).toHaveBeenCalledWith('sh-1', 'u-michele'))
    expect(screen.queryByText(/Link them anyway/)).toBeNull()
  })

  // The safety property: a non-match must never link on a single click.
  it('requires a confirmation naming the mismatch before linking a non-match', async () => {
    open()

    fireEvent.click(within(rowFor('Bob Smith')).getByRole('button', { name: 'Link' }))

    expect(linkShareholderToUser).not.toHaveBeenCalled()
    expect(screen.getByText(/doesn't appear in/)).toBeTruthy()
    expect(screen.getByText('Bob Smith')).toBeTruthy()
    expect(screen.getByText('John and Michele Anderegg')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Link anyway' }))
    await waitFor(() => expect(linkShareholderToUser).toHaveBeenCalledWith('sh-1', 'u-bob'))
  })

  it('lets the admin back out of the confirmation without linking', () => {
    open()

    fireEvent.click(within(rowFor('Bob Smith')).getByRole('button', { name: 'Link' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(linkShareholderToUser).not.toHaveBeenCalled()
    expect(screen.getByText('Suggested')).toBeTruthy()
  })

  it('disables a login that already belongs to another shareholder and says so', () => {
    open()

    const row = rowFor('Ray Miller')
    expect(within(row).getByRole('button', { name: 'Link' })).toHaveProperty('disabled', true)
    expect(within(row).getByText(/already linked to Ray Miller/)).toBeTruthy()
  })

  it('filters by name or email', () => {
    open()

    fireEvent.change(screen.getByPlaceholderText('Filter by name or email'), {
      target: { value: 'bob@' },
    })

    expect(screen.getByText('Bob Smith')).toBeTruthy()
    expect(screen.queryByText('Michele Anderegg')).toBeNull()
  })

  it('says so when the filter matches nobody', () => {
    open()

    fireEvent.change(screen.getByPlaceholderText('Filter by name or email'), {
      target: { value: 'zzzz' },
    })

    expect(screen.getByText('No registered users match that filter.')).toBeTruthy()
  })

  it('surfaces the action error instead of closing', async () => {
    linkShareholderToUser.mockResolvedValue({
      error: 'That login is already linked to a different shareholder',
    })
    open()

    fireEvent.click(within(rowFor('Michele Anderegg')).getByRole('button', { name: 'Link' }))

    await waitFor(() =>
      expect(
        screen.getByText('That login is already linked to a different shareholder'),
      ).toBeTruthy(),
    )
  })

  it('shows Unlink instead of Link once a login is attached', async () => {
    render(
      <LinkShareholderButton
        shareholderId="sh-1"
        shareholderName="John and Michele Anderegg"
        linkedLabel="michele@example.com"
        candidates={CANDIDATES}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Link' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))

    await waitFor(() => expect(unlinkShareholder).toHaveBeenCalledWith('sh-1'))
  })
})
