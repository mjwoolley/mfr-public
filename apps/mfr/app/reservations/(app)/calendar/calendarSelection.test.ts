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

  it('clicking the same day twice produces a 1-night stay [N, N+1)', () => {
    const first = computeSelectionAfterClick(
      { selectionStart: null, selectionEnd: null },
      '2027-07-10',
    )
    const second = computeSelectionAfterClick(first, '2027-07-10')
    expect(second).toEqual({ selectionStart: '2027-07-10', selectionEnd: '2027-07-11' })
  })

  it('clicking day N then day N+1 produces a 2-night range [N, N+2)', () => {
    const first = computeSelectionAfterClick(
      { selectionStart: null, selectionEnd: null },
      '2027-07-10',
    )
    const second = computeSelectionAfterClick(first, '2027-07-11')
    expect(second).toEqual({ selectionStart: '2027-07-10', selectionEnd: '2027-07-12' })
  })

  it('clicking in reverse order (later day first) produces the same [N, N+2) range', () => {
    const first = computeSelectionAfterClick(
      { selectionStart: null, selectionEnd: null },
      '2027-07-11',
    )
    const second = computeSelectionAfterClick(first, '2027-07-10')
    expect(second).toEqual({ selectionStart: '2027-07-10', selectionEnd: '2027-07-12' })
  })

  it('a third click after a complete selection starts a new selection', () => {
    const first = computeSelectionAfterClick(
      { selectionStart: null, selectionEnd: null },
      '2027-07-10',
    )
    const second = computeSelectionAfterClick(first, '2027-07-11')
    const third = computeSelectionAfterClick(second, '2027-08-01')
    expect(third).toEqual({ selectionStart: '2027-08-01', selectionEnd: null })
  })

  it('correctly rolls the checkout date over a month boundary', () => {
    const first = computeSelectionAfterClick(
      { selectionStart: null, selectionEnd: null },
      '2027-07-30',
    )
    const second = computeSelectionAfterClick(first, '2027-07-31')
    expect(second).toEqual({ selectionStart: '2027-07-30', selectionEnd: '2027-08-01' })
  })
})
