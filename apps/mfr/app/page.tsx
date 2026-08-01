// The portal home page — the only public page in the suite: hero slideshow
// for everyone; the fundraising goal card and Upcoming events are member
// content, rendered (and fetched) only for signed-in visitors.

import Link from 'next/link'
import { auth } from '@/lib/auth'
import { getPortalSettings, getFundraising, getEvents } from '@/lib/portal'
import { getFeaturedPhotos } from '@/lib/photos/gallery'
import { computeGoalProgress } from '@/lib/accounting/goals'
import { formatShares } from '@/lib/accounting/format'
import { HomeSlideshow } from './HomeSlideshow'

// Fallback hero image (public/) shown to signed-out visitors and whenever no
// photos have been featured yet.
const FALLBACK_SLIDES = ['/lake-house.jpg']

// Event dates are YYYY-MM-DD strings; parsing at local midnight (T00:00:00,
// no Z) keeps the displayed day from shifting across timezones — same
// rationale as reservations' notification formatting.
function eventDateParts(date: string | null) {
  if (!date) return { mon: '—', day: '', dow: '' }
  const dt = new Date(`${date}T00:00:00`)
  if (isNaN(dt.getTime())) return { mon: '—', day: '', dow: '' }
  return {
    mon: dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: String(dt.getDate()),
    dow: dt.toLocaleDateString('en-US', { weekday: 'long' }),
  }
}

// "Jul 1" for a valid date, else null.
function shortDate(date: string | null) {
  if (!date) return null
  const dt = new Date(`${date}T00:00:00`)
  if (isNaN(dt.getTime())) return null
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// The secondary line under an event: a range ("Jul 1 – Jul 5") for a multi-day
// event, otherwise the weekday and optional time for a single day.
function eventWhen(ev: { startDate: string | null; endDate: string | null; time: string }) {
  if (ev.endDate) {
    const start = shortDate(ev.startDate)
    const end = shortDate(ev.endDate)
    if (start && end) return `${start} – ${end}`
  }
  const { dow } = eventDateParts(ev.startDate)
  return [dow, ev.time].filter(Boolean).join(' · ') || 'Date to be set'
}

export default async function Home() {
  // Home is public, but the goal card and Upcoming events are member content —
  // only signed-in visitors see them (and only they trigger the accounting/DB
  // reads behind them). Signed-out visitors get the generic hero + a sign-in
  // prompt.
  const session = await auth()
  const signedIn = !!session?.user

  const settings = await getPortalSettings()
  const [fundraising, events, featured] = signedIn
    ? await Promise.all([getFundraising(), getEvents(), getFeaturedPhotos()])
    : [null, [] as Awaited<ReturnType<typeof getEvents>>, []]
  // Members see the hero rotate through the family's own featured photos;
  // signed-out visitors (the hero is public) get the generic static fallback, so
  // member photos are never shown publicly.
  const heroImages = signedIn && featured.length ? featured.map((p) => p.blobUrl) : FALLBACK_SLIDES

  const raised = fundraising?.raised ?? 0
  const goal = fundraising?.goal ?? null
  const year = fundraising?.year ?? settings.reunionYear
  // Same math as the accounting dashboard's tracker — shared rather than
  // reimplemented, so the two cards can't drift apart.
  const progress = computeGoalProgress(goal ?? 0, raised)
  const pct = progress.pct
  const goalNote = goal ? progress.note : 'Every share purchase keeps the cabin going.'

  return (
    <div style={{ animation: 'fadeup .5s ease both' }}>
      {/* hero */}
      <section className="mx-auto max-w-5xl px-7 pt-3.5 pb-2">
        <div className="flex flex-wrap items-start gap-9">
          <div className="min-w-[300px] flex-[1_1_380px]">
            <div
              className="text-xs font-bold uppercase"
              style={{ letterSpacing: '.22em', color: 'var(--color-accent-700)' }}
            >
              Lake Lure, North Carolina
            </div>
            <h1
              className="mt-2 mb-3.5"
              style={{ fontSize: 'clamp(30px,3.8vw,44px)', lineHeight: 1.05 }}
            >
              Sixty summers
              <br />
              on the lake.
            </h1>
            <p
              className="mb-3"
              style={{
                fontSize: 14.5,
                lineHeight: 1.55,
                color: 'color-mix(in srgb, var(--color-text) 82%, transparent)',
              }}
            >
              For more than 60 years, our family has gathered each Fourth of July at the Miller
              cabin on Lake Lure, North Carolina. What began as a simple dream by Connie and Ray
              Miller&mdash;to create a place where their children and future generations could spend
              time together&mdash;has grown into a cherished tradition spanning multiple
              generations. Every summer, nearly 40 family members return to this special place to
              share meals, tell stories, laugh, celebrate, and create new memories. The cabin has
              become far more than a vacation home; it is where our family&rsquo;s history is
              remembered and its future is strengthened.
            </p>
            <p
              style={{
                fontSize: 14.5,
                lineHeight: 1.55,
                color: 'color-mix(in srgb, var(--color-text) 82%, transparent)',
              }}
            >
              When Ray Miller passed the cabin on to his twelve grandchildren, he hoped that sharing
              the responsibility of caring for it would keep the family connected for years to come.
              His vision has been realized beyond anything he could have imagined. Through countless
              hours of volunteer work, financial support, and a shared commitment to preserving this
              place, each generation has helped ensure that the tradition continues. This website
              celebrates that legacy, the memories we&rsquo;ve made together, and the family bonds
              that have made the Miller cabin a true home for generations.
            </p>
          </div>

          <div className="flex min-w-[300px] flex-[0_1_480px] flex-col gap-4">
            <HomeSlideshow images={heroImages} />

            {!signedIn && (
              /* signed-out: generic prompt in place of the member-only goal card */
              <div className="card elev-sm bg-white text-center" style={{ padding: '22px 20px' }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20 }}>
                  There&rsquo;s more inside
                </div>
                <p
                  className="mx-auto mt-2 mb-3.5 max-w-sm"
                  style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--color-neutral-700)' }}
                >
                  Sign in to see this year&rsquo;s goal, upcoming events, meals, photos and
                  documents.
                </p>
                <Link
                  href="/sign-in"
                  className="btn btn-primary"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}
                >
                  Sign in
                </Link>
              </div>
            )}

            {/* live fundraising goal card */}
            {signedIn && (
              <div className="card elev-sm bg-white" style={{ padding: '16px 18px 15px' }}>
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <div
                    className="text-[11px] uppercase"
                    style={{ letterSpacing: '.06em', color: 'var(--color-neutral-600)' }}
                  >
                    {year} share goal
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, lineHeight: 1 }}>
                    {formatShares(raised)}{' '}
                    <span style={{ fontSize: 14, color: 'var(--color-neutral-600)' }}>
                      of {goal ? `${formatShares(goal)} shares` : '—'}
                    </span>
                  </div>
                  {settings.venmoUrl && (
                    <a
                      href={settings.venmoUrl}
                      target="_blank"
                      rel="noopener"
                      className="btn btn-primary ml-auto"
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontWeight: 700,
                        padding: '7px 14px',
                        fontSize: 13,
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 7c4 0 6 3.5 6 8 2-3 3-6.5 3-9" />
                        <path d="M15 5c1.5 0 2.5 1.2 2.5 3.5 0 3-2 6.5-4 9.5" />
                      </svg>
                      Venmo
                    </a>
                  )}
                </div>
                <div
                  className="mt-3 overflow-hidden"
                  style={{ height: 12, borderRadius: 999, background: 'var(--color-neutral-200)' }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: 'var(--color-accent-2-500)',
                      borderRadius: 999,
                      transition: 'width .5s ease',
                    }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2.5">
                  <span style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}>
                    {goalNote}
                  </span>
                  <Link href="/accounting" style={{ fontSize: 12.5, fontWeight: 600 }}>
                    Full ledger &rarr;
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* upcoming events (member-only) */}
      {signedIn && (
        <section className="mx-auto max-w-5xl px-7 pt-4.5 pb-1.5">
          <div className="mb-3.5 flex flex-wrap items-baseline gap-3">
            <h2 className="m-0 text-[22px]">Upcoming events</h2>
            <Link href="/admin" className="ml-auto" style={{ fontSize: 13, fontWeight: 600 }}>
              Manage events
            </Link>
          </div>
          <div className="card elev-sm bg-white" style={{ padding: '6px 10px' }}>
            {events.length === 0 && (
              <div
                className="py-5 text-center"
                style={{ color: 'var(--color-neutral-600)', fontSize: 14 }}
              >
                Nothing on the calendar yet.{' '}
                <Link href="/admin" style={{ fontWeight: 700 }}>
                  Add an event
                </Link>
                .
              </div>
            )}
            {events.map((ev) => {
              const { mon, day } = eventDateParts(ev.startDate)
              const when = eventWhen(ev)
              return (
                <div
                  key={ev.id}
                  className="flex items-center gap-4"
                  style={{ padding: '14px 12px', borderRadius: 12 }}
                >
                  <div className="shrink-0 text-center" style={{ width: 58, lineHeight: 1.05 }}>
                    <div
                      className="text-[11px] font-extrabold uppercase"
                      style={{ letterSpacing: '.08em', color: 'var(--color-accent-700)' }}
                    >
                      {mon}
                    </div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26 }}>{day}</div>
                  </div>
                  <div
                    className="self-stretch"
                    style={{ width: 1, background: 'var(--color-neutral-200)' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>
                      {ev.description || 'Untitled event'}
                    </div>
                    <div
                      className="mt-0.5"
                      style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}
                    >
                      {when}
                    </div>
                  </div>
                  {ev.meetingLink && (
                    <a
                      href={ev.meetingLink}
                      target="_blank"
                      rel="noopener"
                      className="btn btn-secondary shrink-0"
                      style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M15 10l5-3v10l-5-3z" />
                        <rect x="3" y="6" width="12" height="12" rx="2" />
                      </svg>
                      Join
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
