// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { LinkLoginControl } from './link-login-control'
import type { LoginOption } from '@/lib/accounting/linkCandidates'

const linkShareholderToUser = vi.fn()
const unlinkShareholder = vi.fn()
vi.mock('@/actions/accounting/shareholders', () => ({
  linkShareholderToUser: (...a: unknown[]) => linkShareholderToUser(...a),
  unlinkShareholder: (...a: unknown[]) => unlinkShareholder(...a),
}))

beforeEach(() => {
  linkShareholderToUser.mockResolvedValue(undefined)
  unlinkShareholder.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const michele: LoginOption = {
  id: 'u-michele',
  email: 'michele@example.com',
  name: 'Michele Anderegg',
}
const bob: LoginOption = { id: 'u-bob', email: 'bob@example.com', name: 'Bob Smith' }
const nameless: LoginOption = { id: 'u-nameless', email: 'zed@example.com', name: null }

function renderControl(over: Partial<Parameters<typeof LinkLoginControl>[0]> = {}) {
  render(
    <LinkLoginControl
      shareholderId="sh-1"
      shareholderName="John and Michele Anderegg"
      shareholderEmail={null}
      linkedLogin={null}
      suggested={[michele]}
      others={[bob]}
      {...over}
    />,
  )
}

const picker = () => screen.getByLabelText('Link a login') as HTMLSelectElement

describe('LinkLoginControl', () => {
  it('groups likely matches above everyone else', () => {
    renderControl()

    const groups = picker().querySelectorAll('optgroup')
    expect(groups[0].label).toBe('Suggested — name matches')
    expect(within(groups[0] as HTMLElement).getByText(/Michele Anderegg/)).toBeTruthy()
    expect(groups[1].label).toBe('Everyone else')
    expect(within(groups[1] as HTMLElement).getByText(/Bob Smith/)).toBeTruthy()
  })

  it('labels a login with no name by its email alone', () => {
    renderControl({ suggested: [], others: [nameless] })

    expect(screen.getByRole('option', { name: 'zed@example.com' })).toBeTruthy()
  })

  it('renames the group when nothing matches, so the admin knows to check', () => {
    renderControl({ suggested: [], others: [bob] })

    expect(picker().querySelectorAll('optgroup')[0].label).toBe('No name matches')
  })

  it('links a suggested login without asking twice', async () => {
    renderControl()

    fireEvent.change(picker(), { target: { value: 'u-michele' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))

    await waitFor(() =>
      expect(linkShareholderToUser).toHaveBeenCalledWith('sh-1', 'u-michele', {
        adoptEmail: false,
      }),
    )
    expect(screen.queryByText(/Link them anyway/)).toBeNull()
  })

  // The safety property: a non-match must never link on a single click.
  it('requires a confirmation naming the mismatch for a non-suggested login', async () => {
    renderControl()

    fireEvent.change(picker(), { target: { value: 'u-bob' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))

    expect(linkShareholderToUser).not.toHaveBeenCalled()
    expect(screen.getByText(/doesn't appear in/)).toBeTruthy()
    expect(screen.getByText('Bob Smith')).toBeTruthy()
    expect(screen.getByText('John and Michele Anderegg')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Link anyway' }))
    await waitFor(() =>
      expect(linkShareholderToUser).toHaveBeenCalledWith('sh-1', 'u-bob', { adoptEmail: false }),
    )
  })

  it('lets the admin back out of the confirmation without linking', () => {
    renderControl()

    fireEvent.change(picker(), { target: { value: 'u-bob' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(linkShareholderToUser).not.toHaveBeenCalled()
    expect(picker()).toBeTruthy()
  })

  it('cannot submit with nothing chosen', () => {
    renderControl()

    expect(screen.getByRole('button', { name: 'Link' })).toHaveProperty('disabled', true)
  })

  it('surfaces the action error instead of clearing the picker', async () => {
    linkShareholderToUser.mockResolvedValue({
      error: 'That login is already linked to a different shareholder',
    })
    renderControl()

    fireEvent.change(picker(), { target: { value: 'u-michele' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))

    await waitFor(() =>
      expect(
        screen.getByText('That login is already linked to a different shareholder'),
      ).toBeTruthy(),
    )
  })

  it('shows who is linked, and unlinks, when a login is attached', async () => {
    renderControl({ linkedLogin: michele })

    expect(screen.getByText(/Michele Anderegg/)).toBeTruthy()
    expect(screen.getByText('michele@example.com')).toBeTruthy()
    expect(screen.queryByLabelText('Link a login')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
    await waitFor(() => expect(unlinkShareholder).toHaveBeenCalledWith('sh-1'))
  })

  it('says so when every login is already spoken for', () => {
    renderControl({ suggested: [], others: [] })

    expect(screen.getByText(/already linked to another shareholder/)).toBeTruthy()
    expect(screen.queryByLabelText('Link a login')).toBeNull()
  })
})

// The shareholder's own email is the second thing linking decides. A blank one
// is filled in server-side without asking; one that DIFFERS is the household
// case ("John and Michele Anderegg" holding john@) and must not be overwritten
// without the admin saying so.
describe('LinkLoginControl — the shareholder email', () => {
  it('asks nothing when the emails already match', async () => {
    renderControl({ shareholderEmail: 'michele@example.com' })

    fireEvent.change(picker(), { target: { value: 'u-michele' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))

    await waitFor(() =>
      expect(linkShareholderToUser).toHaveBeenCalledWith('sh-1', 'u-michele', {
        adoptEmail: false,
      }),
    )
    expect(screen.queryByText(/differs from the shareholder/)).toBeNull()
  })

  it('ignores case when comparing the two emails', async () => {
    renderControl({ shareholderEmail: 'MICHELE@Example.com  ' })

    fireEvent.change(picker(), { target: { value: 'u-michele' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))

    await waitFor(() => expect(linkShareholderToUser).toHaveBeenCalled())
    expect(screen.queryByText(/differs from the shareholder/)).toBeNull()
  })

  it('asks nothing when the shareholder has no email at all', async () => {
    renderControl({ shareholderEmail: null })

    fireEvent.change(picker(), { target: { value: 'u-michele' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))

    await waitFor(() => expect(linkShareholderToUser).toHaveBeenCalled())
    expect(screen.queryByText(/differs from the shareholder/)).toBeNull()
  })

  it('offers keep-or-adopt when the emails differ, showing both addresses', async () => {
    renderControl({ shareholderEmail: 'john@example.com' })

    fireEvent.change(picker(), { target: { value: 'u-michele' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))

    expect(linkShareholderToUser).not.toHaveBeenCalled()
    expect(screen.getByText(/differs from the shareholder/)).toBeTruthy()
    // Read the <code> rows: each address is split across text and <mark> nodes
    // so the differing run can be highlighted, so getByText can't see it whole.
    const codes = [...document.querySelectorAll('code')].map((c) => c.textContent)
    expect(codes).toContain('john@example.com')
    expect(codes).toContain('michele@example.com')
  })

  // The household case: keep john@, still link Michele.
  it('links without touching the email when the admin keeps it', async () => {
    renderControl({ shareholderEmail: 'john@example.com' })

    fireEvent.change(picker(), { target: { value: 'u-michele' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    fireEvent.click(screen.getByRole('button', { name: /Link, keep john@example\.com/ }))

    await waitFor(() =>
      expect(linkShareholderToUser).toHaveBeenCalledWith('sh-1', 'u-michele', {
        adoptEmail: false,
      }),
    )
  })

  it('adopts the login email when the admin chooses to', async () => {
    renderControl({ shareholderEmail: 'john@example.com' })

    fireEvent.change(picker(), { target: { value: 'u-michele' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    fireEvent.click(screen.getByRole('button', { name: /Link and use michele@example\.com/ }))

    await waitFor(() =>
      expect(linkShareholderToUser).toHaveBeenCalledWith('sh-1', 'u-michele', { adoptEmail: true }),
    )
  })

  it('shows both warnings when the name mismatches AND the email differs', async () => {
    renderControl({ shareholderEmail: 'john@example.com' })

    fireEvent.change(picker(), { target: { value: 'u-bob' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))

    expect(screen.getByText(/doesn't appear in/)).toBeTruthy()
    expect(screen.getByText(/differs from the shareholder/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Link, keep/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Link and use/ })).toBeTruthy()
  })

  it('surfaces the clash error when another shareholder owns that email', async () => {
    linkShareholderToUser.mockResolvedValue({
      error: '"Ray Miller" already uses michele@example.com. Clear it there first, then link.',
    })
    renderControl({ shareholderEmail: 'john@example.com' })

    fireEvent.change(picker(), { target: { value: 'u-michele' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    fireEvent.click(screen.getByRole('button', { name: /Link and use/ }))

    await waitFor(() => expect(screen.getByText(/"Ray Miller" already uses/)).toBeTruthy())
  })
})

// A near-identical pair is exactly the pair that needs this prompt, and the one
// most likely to make it look broken. From production: a shareholder record
// carrying "melanmiller20@" while the login is "melanimiller20@" — one missing
// character, invisible in prose.
describe('LinkLoginControl — showing WHERE the emails differ', () => {
  const melani: LoginOption = {
    id: 'u-melani',
    email: 'melanimiller20@gmail.com',
    name: 'Melani Miller',
  }

  function openDiff() {
    renderControl({
      shareholderName: 'Melani & Ron Pottorf',
      shareholderEmail: 'melanmiller20@gmail.com',
      suggested: [],
      others: [melani],
    })
    fireEvent.change(picker(), { target: { value: 'u-melani' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
  }

  it('highlights only the differing character', () => {
    openDiff()

    const marks = document.querySelectorAll('mark')
    // One address is missing the character entirely, so only the other is marked.
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('i')
  })

  it('still shows both addresses in full', () => {
    openDiff()

    const codes = [...document.querySelectorAll('code')].map((c) => c.textContent)
    expect(codes).toContain('melanmiller20@gmail.com')
    expect(codes).toContain('melanimiller20@gmail.com')
  })

  it('says which side is missing the highlighted part', () => {
    openDiff()

    expect(screen.getByText(/the shareholder.s is missing it/)).toBeTruthy()
  })

  it('marks both sides when each has its own differing run', () => {
    renderControl({
      shareholderEmail: 'john@example.com',
      suggested: [],
      others: [michele],
    })
    fireEvent.change(picker(), { target: { value: 'u-michele' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))

    const marks = [...document.querySelectorAll('mark')].map((m) => m.textContent)
    expect(marks).toEqual(['john', 'michele'])
  })
})
