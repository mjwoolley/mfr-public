// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ModalDialog } from './ModalDialog'

afterEach(cleanup)

describe('ModalDialog', () => {
  it('opens the native dialog as a modal on mount', () => {
    const { container } = render(
      <ModalDialog title="Edit reservation" onClose={() => {}}>
        <p>body</p>
      </ModalDialog>,
    )

    const dialog = container.querySelector('dialog')!
    expect(dialog.open).toBe(true)
    expect(screen.getByText('Edit reservation')).toBeTruthy()
    expect(screen.getByText('body')).toBeTruthy()
  })

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn()
    render(
      <ModalDialog title="t" onClose={onClose}>
        <p>body</p>
      </ModalDialog>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop (the dialog host itself) is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(
      <ModalDialog title="t" onClose={onClose}>
        <p>body</p>
      </ModalDialog>,
    )

    fireEvent.click(container.querySelector('dialog')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT close when a click lands inside the dialog card', () => {
    const onClose = vi.fn()
    render(
      <ModalDialog title="t" onClose={onClose}>
        <p>body</p>
      </ModalDialog>,
    )

    fireEvent.click(screen.getByText('body'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it("calls onClose when the dialog fires its native close event (Escape's path)", () => {
    const onClose = vi.fn()
    const { container } = render(
      <ModalDialog title="t" onClose={onClose}>
        <p>body</p>
      </ModalDialog>,
    )

    fireEvent(container.querySelector('dialog')!, new Event('close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
