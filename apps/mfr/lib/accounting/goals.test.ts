import { describe, expect, it } from 'vitest'
import { computeGoalProgress } from './goals'

describe('computeGoalProgress', () => {
  it('reports percent funded and dollars to go', () => {
    expect(computeGoalProgress(12000, 3000)).toEqual({
      pct: 25,
      remaining: 9000,
      note: '25% funded · $9,000 to go',
    })
  })

  it('clamps percent at 100 and remaining at 0 when the goal is exceeded', () => {
    expect(computeGoalProgress(12000, 15000)).toEqual({
      pct: 100,
      remaining: 0,
      note: 'Goal met — thank you, everyone!',
    })
  })

  it('treats exactly meeting the goal as met', () => {
    expect(computeGoalProgress(12000, 12000).note).toBe('Goal met — thank you, everyone!')
  })

  it('returns an empty state for a non-positive goal', () => {
    expect(computeGoalProgress(0, 500)).toEqual({ pct: 0, remaining: 0, note: '' })
  })
})
