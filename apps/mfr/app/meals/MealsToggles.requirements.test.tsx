// @vitest-environment happy-dom
// Requirements coverage for CAP-011 Meal RSVPs: the member's own Lunch/Dinner
// buttons flip straight away (before the server confirms) and the "meals
// marked" count follows. Persistence across reloads is asserted at the server
// level (tests/integration/portalContent.test.ts) and in e2e (admin-edge.spec).
import { describe, expect, it, vi, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const { toggleMealMock } = vi.hoisted(() => ({ toggleMealMock: vi.fn() }))
vi.mock('./actions', () => ({ toggleMeal: toggleMealMock }))

import { MealsToggles, type YourDay } from './MealsToggles'

afterEach(() => {
  cleanup()
  toggleMealMock.mockReset()
})

const week = (over: Partial<Record<number, Partial<YourDay>>> = {}): YourDay[] =>
  ['Jul 1', 'Jul 2', 'Jul 3'].map((date, i) => ({
    index: i + 1,
    dow: ['Sat', 'Sun', 'Mon'][i],
    date,
    lunch: false,
    dinner: false,
    ...over[i + 1],
  }))

/** The Lunch/Dinner button for the day labelled `date`. */
function button(date: string, meal: RegExp) {
  const row = screen.getByText(date).closest('div.flex') as HTMLElement
  const btn = [...row.querySelectorAll('button')].find((b) => meal.test(b.textContent ?? ''))
  if (!btn) throw new Error(`no ${meal} button on ${date}`)
  return btn
}

describe('CAP-011 Meal RSVPs — Your meals', () => {
  it('CAP-011 · Marking a meal', async () => {
    // The server action is still in flight: the change shows straight away.
    toggleMealMock.mockReturnValue(new Promise(() => {}))
    render(<MealsToggles your={week()} userName="Mary Me" userInitials="MM" userTotal={0} />)
    expect(screen.getByText(/0 meals marked/)).toBeTruthy()

    await act(async () => {
      fireEvent.click(button('Jul 1', /Lunch/))
    })

    expect(toggleMealMock).toHaveBeenCalledTimes(1)
    expect(button('Jul 1', /Lunch/).textContent).toBe('✓ Lunch')
    expect(button('Jul 1', /Dinner/).textContent).toBe('Dinner')
    expect(button('Jul 2', /Lunch/).textContent).toBe('Lunch')
    expect(screen.getByText(/Mary Me · 1 meal marked/)).toBeTruthy()
  })

  it('CAP-011 · Unmarking a meal', async () => {
    toggleMealMock.mockReturnValue(new Promise(() => {}))
    render(
      <MealsToggles
        your={week({ 1: { lunch: true }, 2: { dinner: true } })}
        userName="Mary Me"
        userInitials="MM"
        userTotal={2}
      />,
    )
    expect(button('Jul 1', /Lunch/).textContent).toBe('✓ Lunch')
    expect(screen.getByText(/2 meals marked/)).toBeTruthy()

    await act(async () => {
      fireEvent.click(button('Jul 1', /Lunch/))
    })

    expect(toggleMealMock).toHaveBeenCalledTimes(1)
    expect(button('Jul 1', /Lunch/).textContent).toBe('Lunch')
    expect(screen.getByText(/1 meal marked/)).toBeTruthy()
  })
})
