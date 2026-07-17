import { describe, it, expect } from 'vitest'
import { computeSelectionAfterClick } from './calendarSelection'

describe('computeSelectionAfterClick', () => {
  it('sets selectionStart on the first click, leaving selectionEnd unset', () => {
    const next = computeSelectionAfterClick(
      { selectionStart: null, selectionEnd: null },
      '2027-07-10',
    )
    expect(next).toEqual({ selectionStart: '2027-07-10', selectionEnd: null })
  })

  it('clicking the same day twice (checkout == check-in, 0 nights) keeps selecting', () => {
    const first = computeSelectionAfterClick(
      { selectionStart: null, selectionEnd: null },
      '2027-07-10',
    )
    const second = computeSelectionAfterClick(first, '2027-07-10')
    expect(second).toEqual({ selectionStart: '2027-07-10', selectionEnd: null })
  })

  it('clicking check-in Mon then check-out Wed produces a 2-night range [Mon, Wed)', () => {
    const first = computeSelectionAfterClick(
      { selectionStart: null, selectionEnd: null },
      '2027-07-10',
    )
    // Wed is the checkout day and maps straight to selectionEnd (no +1).
    const second = computeSelectionAfterClick(first, '2027-07-12')
    expect(second).toEqual({ selectionStart: '2027-07-10', selectionEnd: '2027-07-12' })
  })

  it('clicking day N then day N+1 produces a 1-night range [N, N+1)', () => {
    const first = computeSelectionAfterClick(
      { selectionStart: null, selectionEnd: null },
      '2027-07-10',
    )
    const second = computeSelectionAfterClick(first, '2027-07-11')
    expect(second).toEqual({ selectionStart: '2027-07-10', selectionEnd: '2027-07-11' })
  })

  it('clicking in reverse order (later day first) produces the same [Mon, Wed) range', () => {
    const first = computeSelectionAfterClick(
      { selectionStart: null, selectionEnd: null },
      '2027-07-12',
    )
    const second = computeSelectionAfterClick(first, '2027-07-10')
    expect(second).toEqual({ selectionStart: '2027-07-10', selectionEnd: '2027-07-12' })
  })

  it('a third click after a complete selection starts a new selection', () => {
    const first = computeSelectionAfterClick(
      { selectionStart: null, selectionEnd: null },
      '2027-07-10',
    )
    const second = computeSelectionAfterClick(first, '2027-07-12')
    const third = computeSelectionAfterClick(second, '2027-08-01')
    expect(third).toEqual({ selectionStart: '2027-08-01', selectionEnd: null })
  })

  it('handles a check-out date that lands in the next month', () => {
    const first = computeSelectionAfterClick(
      { selectionStart: null, selectionEnd: null },
      '2027-07-30',
    )
    const second = computeSelectionAfterClick(first, '2027-08-01')
    expect(second).toEqual({ selectionStart: '2027-07-30', selectionEnd: '2027-08-01' })
  })
})
