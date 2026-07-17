import { describe, it, expect } from 'vitest'
import { isDayInSelection } from './dayInSelection'

describe('isDayInSelection', () => {
  describe('completed selection (selectionEnd set)', () => {
    it('highlights the check-in date THROUGH the check-out date inclusively', () => {
      // Check-in Jul 21, check-out Jul 23 (a 2-night stay): 21, 22 AND 23 all
      // highlighted; the checkout day is included.
      const selectionStart = '2026-07-21'
      const selectionEnd = '2026-07-23' // checkout day, per calendarSelection.ts

      expect(isDayInSelection('2026-07-20', selectionStart, selectionEnd, null)).toBe(false)
      expect(isDayInSelection('2026-07-21', selectionStart, selectionEnd, null)).toBe(true)
      expect(isDayInSelection('2026-07-22', selectionStart, selectionEnd, null)).toBe(true)
      expect(isDayInSelection('2026-07-23', selectionStart, selectionEnd, null)).toBe(true)
      expect(isDayInSelection('2026-07-24', selectionStart, selectionEnd, null)).toBe(false)
    })

    it('highlights both the check-in and check-out day for a single-night stay', () => {
      // Check-in Jul 10, check-out Jul 11 (1 night): 10 AND 11 highlighted.
      const selectionStart = '2027-07-10'
      const selectionEnd = '2027-07-11'

      expect(isDayInSelection('2027-07-09', selectionStart, selectionEnd, null)).toBe(false)
      expect(isDayInSelection('2027-07-10', selectionStart, selectionEnd, null)).toBe(true)
      expect(isDayInSelection('2027-07-11', selectionStart, selectionEnd, null)).toBe(true)
      expect(isDayInSelection('2027-07-12', selectionStart, selectionEnd, null)).toBe(false)
    })

    it('ignores hoverDate once a selection is completed', () => {
      const selectionStart = '2027-07-10'
      const selectionEnd = '2027-07-12'

      expect(isDayInSelection('2027-07-15', selectionStart, selectionEnd, '2027-07-15')).toBe(false)
      expect(isDayInSelection('2027-07-11', selectionStart, selectionEnd, '2027-07-20')).toBe(true)
    })
  })

  describe('in-progress hover preview (only selectionStart set)', () => {
    it('highlights the check-in date through the hovered check-out day inclusively', () => {
      const selectionStart = '2027-07-10'
      const hoverDate = '2027-07-13' // candidate check-out day

      expect(isDayInSelection('2027-07-09', selectionStart, null, hoverDate)).toBe(false)
      expect(isDayInSelection('2027-07-10', selectionStart, null, hoverDate)).toBe(true)
      expect(isDayInSelection('2027-07-11', selectionStart, null, hoverDate)).toBe(true)
      expect(isDayInSelection('2027-07-12', selectionStart, null, hoverDate)).toBe(true)
      // the hovered check-out day IS highlighted
      expect(isDayInSelection('2027-07-13', selectionStart, null, hoverDate)).toBe(true)
      expect(isDayInSelection('2027-07-14', selectionStart, null, hoverDate)).toBe(false)
    })

    it('handles hovering backwards over an earlier day than the check-in date', () => {
      const selectionStart = '2027-07-12'
      const hoverDate = '2027-07-10'

      expect(isDayInSelection('2027-07-09', selectionStart, null, hoverDate)).toBe(false)
      expect(isDayInSelection('2027-07-10', selectionStart, null, hoverDate)).toBe(true)
      expect(isDayInSelection('2027-07-11', selectionStart, null, hoverDate)).toBe(true)
      expect(isDayInSelection('2027-07-12', selectionStart, null, hoverDate)).toBe(true)
    })

    it('highlights only the check-in date when hovering the same day', () => {
      expect(isDayInSelection('2027-07-10', '2027-07-10', null, '2027-07-10')).toBe(true)
      expect(isDayInSelection('2027-07-11', '2027-07-10', null, '2027-07-10')).toBe(false)
    })
  })

  describe('no selection', () => {
    it('returns false when there is no selectionStart', () => {
      expect(isDayInSelection('2027-07-10', null, null, null)).toBe(false)
      expect(isDayInSelection('2027-07-10', null, null, '2027-07-10')).toBe(false)
    })

    it('returns false when selectionStart is set but there is no hoverDate or selectionEnd (no range to preview)', () => {
      expect(isDayInSelection('2027-07-10', '2027-07-10', null, null)).toBe(false)
      expect(isDayInSelection('2027-07-11', '2027-07-10', null, null)).toBe(false)
    })
  })
})
