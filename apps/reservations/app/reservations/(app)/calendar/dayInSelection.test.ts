import { describe, it, expect } from 'vitest'
import { isDayInSelection } from './dayInSelection'

describe('isDayInSelection', () => {
  describe('completed selection (selectionEnd set)', () => {
    it('highlights day N and N+1 for a 2-night stay [N, N+2), but not the checkout day N+2', () => {
      const selectionStart = '2027-07-10'
      const selectionEnd = '2027-07-12' // exclusive checkout, per calendarSelection.ts

      expect(isDayInSelection('2027-07-09', selectionStart, selectionEnd, null)).toBe(false)
      expect(isDayInSelection('2027-07-10', selectionStart, selectionEnd, null)).toBe(true)
      expect(isDayInSelection('2027-07-11', selectionStart, selectionEnd, null)).toBe(true)
      expect(isDayInSelection('2027-07-12', selectionStart, selectionEnd, null)).toBe(false)
    })

    it('highlights only day N for a single-night stay [N, N+1)', () => {
      const selectionStart = '2027-07-10'
      const selectionEnd = '2027-07-11'

      expect(isDayInSelection('2027-07-09', selectionStart, selectionEnd, null)).toBe(false)
      expect(isDayInSelection('2027-07-10', selectionStart, selectionEnd, null)).toBe(true)
      expect(isDayInSelection('2027-07-11', selectionStart, selectionEnd, null)).toBe(false)
    })

    it('ignores hoverDate once a selection is completed', () => {
      const selectionStart = '2027-07-10'
      const selectionEnd = '2027-07-12'

      expect(isDayInSelection('2027-07-15', selectionStart, selectionEnd, '2027-07-15')).toBe(false)
      expect(isDayInSelection('2027-07-11', selectionStart, selectionEnd, '2027-07-20')).toBe(true)
    })
  })

  describe('in-progress hover preview (only selectionStart set)', () => {
    it('highlights the full inclusive range from selectionStart through the hovered day', () => {
      const selectionStart = '2027-07-10'
      const hoverDate = '2027-07-12'

      expect(isDayInSelection('2027-07-09', selectionStart, null, hoverDate)).toBe(false)
      expect(isDayInSelection('2027-07-10', selectionStart, null, hoverDate)).toBe(true)
      expect(isDayInSelection('2027-07-11', selectionStart, null, hoverDate)).toBe(true)
      expect(isDayInSelection('2027-07-12', selectionStart, null, hoverDate)).toBe(true)
      expect(isDayInSelection('2027-07-13', selectionStart, null, hoverDate)).toBe(false)
    })

    it('handles hovering backwards over an earlier day than selectionStart', () => {
      const selectionStart = '2027-07-12'
      const hoverDate = '2027-07-10'

      expect(isDayInSelection('2027-07-10', selectionStart, null, hoverDate)).toBe(true)
      expect(isDayInSelection('2027-07-11', selectionStart, null, hoverDate)).toBe(true)
      expect(isDayInSelection('2027-07-12', selectionStart, null, hoverDate)).toBe(true)
    })

    it('highlights only selectionStart when hovering the same day', () => {
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
