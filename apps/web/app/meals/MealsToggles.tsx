'use client'

import { useOptimistic, useTransition, type CSSProperties } from 'react'
import { toggleMeal } from './actions'

export interface YourDay {
  index: number
  dow: string
  date: string
  lunch: boolean
  dinner: boolean
}

function pill(on: boolean): CSSProperties {
  return {
    padding: '9px 15px',
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: on ? 'var(--color-accent-2)' : '#fff',
    color: on ? '#fff' : 'var(--color-text)',
    border: on ? '1.5px solid var(--color-accent-2)' : '1.5px solid var(--color-neutral-300)',
    transition: 'all .12s ease',
  }
}

export function MealsToggles({
  your,
  userName,
  userInitials,
  userTotal,
}: {
  your: YourDay[]
  userName: string
  userInitials: string
  userTotal: number
}) {
  const [, startTransition] = useTransition()
  const [optimistic, addOptimistic] = useOptimistic(
    your,
    (state: YourDay[], { index, meal }: { index: number; meal: 'L' | 'D' }) =>
      state.map((d) =>
        d.index === index
          ? { ...d, lunch: meal === 'L' ? !d.lunch : d.lunch, dinner: meal === 'D' ? !d.dinner : d.dinner }
          : d,
      ),
  )

  const toggle = (index: number, meal: 'L' | 'D') => {
    startTransition(async () => {
      addOptimistic({ index, meal })
      await toggleMeal({ dayIndex: index, meal })
    })
  }

  const total = optimistic.reduce((n, d) => n + (d.lunch ? 1 : 0) + (d.dinner ? 1 : 0), 0) || userTotal

  return (
    <div className="card elev-sm bg-white" style={{ padding: '22px 22px 20px' }}>
      <div className="mb-1 flex items-center gap-2.5">
        <span
          className="flex items-center justify-center text-[13px] font-extrabold text-white"
          style={{ width: 34, height: 34, borderRadius: 999, background: 'var(--color-accent)' }}
          aria-hidden
        >
          {userInitials}
        </span>
        <div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, lineHeight: 1.1 }}>Your meals</div>
          <div style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>
            {userName} &middot; {total === 1 ? '1 meal marked' : `${total} meals marked`}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {optimistic.map((d) => (
          <div key={d.index} className="flex items-center gap-3" style={{ padding: '10px 4px', borderTop: '1px solid var(--color-neutral-200)' }}>
            <div style={{ minWidth: 74 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{d.dow}</div>
              <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>{d.date}</div>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <button onClick={() => toggle(d.index, 'L')} style={pill(d.lunch)}>
                {d.lunch ? '✓ ' : ''}Lunch
              </button>
              <button onClick={() => toggle(d.index, 'D')} style={pill(d.dinner)}>
                {d.dinner ? '✓ ' : ''}Dinner
              </button>
            </div>
          </div>
        ))}
        {optimistic.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>
            The reunion dates aren&rsquo;t set yet — check back once Admin adds them.
          </p>
        )}
      </div>

      <p className="mt-3.5" style={{ fontSize: 12.5, color: 'var(--color-neutral-600)' }}>
        Tip: tap a meal to toggle it. Your changes are visible to the whole family.
      </p>
    </div>
  )
}
