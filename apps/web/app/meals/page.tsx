import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import { requireApproved } from '@/lib/authz'
import { getMealsView, getPortalSettings } from '@/lib/portal'
import { MealsToggles } from './MealsToggles'

export const metadata: Metadata = { title: 'Meals' }

function dot(on: boolean, kind: 'l' | 'd'): CSSProperties {
  return {
    width: 13,
    height: 13,
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
    background: on
      ? kind === 'l'
        ? 'var(--color-accent)'
        : 'var(--color-accent-2)'
      : 'var(--color-neutral-200)',
  }
}

export default async function MealsPage() {
  const session = await requireApproved()
  const [view, settings] = await Promise.all([getMealsView(session.user.id), getPortalSettings()])
  const me = view.roster.find((r) => r.isYou)

  return (
    <section
      className="mx-auto max-w-5xl px-7 pt-6 pb-2"
      style={{ animation: 'fadeup .4s ease both' }}
    >
      <div
        className="text-xs font-bold uppercase"
        style={{ letterSpacing: '.22em', color: 'var(--color-accent-700)' }}
      >
        Reunion week &middot; {view.rangeLabel}, {settings.reunionYear}
      </div>
      <h1 className="mt-2.5" style={{ fontSize: 'clamp(34px,4.4vw,46px)', lineHeight: 1.05 }}>
        Who&rsquo;s here for which meals?
      </h1>
      <p
        className="mt-3 max-w-[620px]"
        style={{
          fontSize: 16,
          lineHeight: 1.65,
          color: 'color-mix(in srgb, var(--color-text) 78%, transparent)',
        }}
      >
        So we can shop and cook for the right headcount, mark the meals you&rsquo;ll be at the cabin
        for. Everyone with access can fill this in &mdash; the summary below updates as people
        respond.
      </p>

      <div
        className="mt-6 grid items-start gap-6"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
      >
        <MealsToggles
          your={view.your}
          userName={me?.name ?? session.user.email ?? 'You'}
          userInitials={me?.initials ?? '••'}
          userTotal={view.userTotal}
        />

        <div className="flex flex-col gap-4">
          <div
            className="card"
            style={{
              background: 'var(--color-accent-2-100)',
              border: '1px solid var(--color-accent-2-200)',
              padding: '16px 20px',
            }}
          >
            <div
              className="text-xs font-bold uppercase"
              style={{ letterSpacing: '.05em', color: 'var(--color-accent-2-700)' }}
            >
              Biggest meal so far
            </div>
            <div className="mt-1" style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>
              {view.peakLabel}
            </div>
          </div>
          {view.headcount.map((h) => (
            <div key={h.index} className="card elev-sm bg-white" style={{ padding: '14px 18px' }}>
              <div className="mb-2.5" style={{ fontWeight: 800, fontSize: 15 }}>
                {h.dow}{' '}
                <span style={{ color: 'var(--color-neutral-600)', fontWeight: 600 }}>{h.date}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                <div className="flex items-baseline gap-2.5">
                  <span
                    className="inline-flex items-center gap-1.5"
                    style={{ minWidth: 82, fontWeight: 700, fontSize: 14 }}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: 'var(--color-accent)',
                      }}
                    />
                    Lunch
                  </span>
                  <span style={{ fontWeight: 800, color: 'var(--color-accent-700)' }}>
                    {h.lunchCount}
                  </span>
                  <span
                    style={{ fontSize: 13, color: 'var(--color-neutral-600)', lineHeight: 1.4 }}
                  >
                    {h.lunchNames}
                  </span>
                </div>
                <div className="flex items-baseline gap-2.5">
                  <span
                    className="inline-flex items-center gap-1.5"
                    style={{ minWidth: 82, fontWeight: 700, fontSize: 14 }}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: 'var(--color-accent-2)',
                      }}
                    />
                    Dinner
                  </span>
                  <span style={{ fontWeight: 800, color: 'var(--color-accent-2-700)' }}>
                    {h.dinnerCount}
                  </span>
                  <span
                    style={{ fontSize: 13, color: 'var(--color-neutral-600)', lineHeight: 1.4 }}
                  >
                    {h.dinnerNames}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* full roster */}
      <div className="card elev-sm bg-white mt-6" style={{ padding: '22px 22px 20px' }}>
        <div className="mb-1.5 flex flex-wrap items-baseline gap-3">
          <h2 className="m-0 text-[22px]">Everyone&rsquo;s meals</h2>
          <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>
            Sorted by last name
          </span>
          <span
            className="ml-auto inline-flex gap-4"
            style={{ fontSize: 12.5, color: 'var(--color-neutral-700)' }}
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: 'var(--color-accent)',
                }}
              />
              Lunch
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: 'var(--color-accent-2)',
                }}
              />
              Dinner
            </span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <div style={{ minWidth: 560 }}>
            {/* header row */}
            <div
              className="flex items-end gap-1.5"
              style={{ padding: '0 0 8px', borderBottom: '2px solid var(--color-neutral-200)' }}
            >
              <div
                style={{
                  minWidth: 184,
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--color-neutral-600)',
                  textTransform: 'uppercase',
                  letterSpacing: '.04em',
                }}
              >
                Family member
              </div>
              {view.days.map((d) => (
                <div key={d.index} className="flex-1 text-center" style={{ minWidth: 64 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{d.dow}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>{d.date}</div>
                </div>
              ))}
            </div>
            {/* rows */}
            {view.roster.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-1.5"
                style={{
                  padding: '9px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--color-neutral-200)',
                  background: p.isYou ? 'var(--color-accent-100)' : 'transparent',
                  borderRadius: 8,
                }}
              >
                <div className="flex items-center gap-2.5" style={{ minWidth: 184 }}>
                  <span
                    className="flex shrink-0 items-center justify-center text-[11px] font-extrabold text-white"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      background: 'var(--color-accent-600)',
                    }}
                    aria-hidden
                  >
                    {p.initials}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    {p.name}
                    {p.isYou && <span style={{ color: 'var(--color-neutral-600)' }}> (you)</span>}
                  </span>
                </div>
                {p.cells.map((c, j) => (
                  <div
                    key={j}
                    className="flex flex-1 items-center justify-center gap-2"
                    style={{ minWidth: 64 }}
                  >
                    <span style={dot(c.lunch, 'l')} />
                    <span style={dot(c.dinner, 'd')} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
