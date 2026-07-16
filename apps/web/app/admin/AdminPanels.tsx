'use client'

import { useState, useTransition, type CSSProperties } from 'react'
import {
  saveSchedule,
  saveLinks,
  addAlbumYear,
  setAlbumUrl,
  removeAlbum,
  addEvent,
  updateEvent,
  removeEvent,
  type ActionResult,
} from './actions'
import { buildDays } from '@/lib/reunionDays'

const inputStyle: CSSProperties = {
  width: '100%',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  color: 'var(--color-text)',
  background: 'var(--color-bg)',
  border: '1.5px solid var(--color-neutral-300)',
  borderRadius: 12,
  padding: '10px 13px',
}
const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-600)',
}

function useAction() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<ActionResult>) => {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res && 'error' in res) setError(res.error)
    })
  }
  return { pending, error, run }
}

function TrashIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </svg>
  )
}
function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

// ── Reunion schedule ─────────────────────────────────────────────────────────

export function ScheduleForm({
  reunionYear,
  reunionStart,
  reunionEnd,
}: {
  reunionYear: number
  reunionStart: string | null
  reunionEnd: string | null
}) {
  const { pending, error, run } = useAction()
  const [year, setYear] = useState(String(reunionYear))
  const [start, setStart] = useState(reunionStart ?? '')
  const [end, setEnd] = useState(reunionEnd ?? '')
  const days = buildDays(start, end)

  return (
    <div className="card elev-sm bg-white" style={{ padding: '24px 24px 22px' }}>
      <h2 className="m-0 text-[22px]">Reunion schedule</h2>
      <p className="mt-2" style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--color-neutral-700)' }}>
        Set the year and date range for the gathering. The Meals page builds a lunch and dinner slot
        for every day in this range.
      </p>
      <div className="mt-4.5 flex flex-wrap gap-3.5">
        <label style={{ ...labelStyle, flex: '0 0 100px' }}>
          Year
          <input style={inputStyle} type="number" value={year} onChange={(e) => setYear(e.target.value)} />
        </label>
        <label style={{ ...labelStyle, flex: '1 1 130px' }}>
          First day
          <input style={inputStyle} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label style={{ ...labelStyle, flex: '1 1 130px' }}>
          Last day
          <input style={inputStyle} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <div className="mt-4.5 pt-4" style={{ borderTop: '1px solid var(--color-neutral-200)' }}>
        <div className="text-xs font-bold uppercase" style={{ letterSpacing: '.04em', color: 'var(--color-neutral-600)' }}>
          {days.length ? `${days.length} days · ${days.length * 2} meal slots` : 'Set a valid date range'}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {days.map((d) => (
            <span key={d.index} className="tag tag-accent-2" style={{ fontWeight: 600 }}>
              {d.dow} {d.date}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          className="btn btn-primary"
          disabled={pending}
          style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}
          onClick={() => run(() => saveSchedule({ reunionYear: year, reunionStart: start, reunionEnd: end }))}
        >
          Save schedule
        </button>
        {error && <span style={{ fontSize: 13, color: 'var(--color-accent-700)' }}>{error}</span>}
      </div>
    </div>
  )
}

// ── Links & sharing ──────────────────────────────────────────────────────────

export function LinksForm({
  highlightsUrl,
  driveUrl,
  venmoUrl,
  chatUrl,
}: {
  highlightsUrl: string
  driveUrl: string
  venmoUrl: string
  chatUrl: string
}) {
  const { pending, error, run } = useAction()
  const [h, setH] = useState(highlightsUrl)
  const [d, setD] = useState(driveUrl)
  const [v, setV] = useState(venmoUrl)
  const [c, setC] = useState(chatUrl)

  const field = (lbl: string, val: string, set: (s: string) => void, ph: string) => (
    <label style={labelStyle}>
      {lbl}
      <input style={inputStyle} value={val} onChange={(e) => set(e.target.value)} placeholder={ph} />
    </label>
  )

  return (
    <div className="card elev-sm bg-white" style={{ padding: '24px 24px 22px' }}>
      <h2 className="m-0 text-[22px]">Links &amp; sharing</h2>
      <p className="mt-2" style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--color-neutral-700)' }}>
        The shared links family members use — the home slideshow&rsquo;s highlights album, the Drive
        documents folder, the family Venmo, and the Family Chat space.
      </p>
      <div className="mt-4.5 flex flex-col gap-3.5">
        {field('Home highlights album', h, setH, 'https://photos.app.goo.gl/…')}
        {field('Drive documents folder', d, setD, 'https://drive.google.com/drive/folders/…')}
        {field('Family Venmo', v, setV, 'https://venmo.com/u/…')}
        {field('Family Chat space', c, setC, 'https://chat.google.com/…')}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          className="btn btn-primary"
          disabled={pending}
          style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}
          onClick={() => run(() => saveLinks({ highlightsUrl: h, driveUrl: d, venmoUrl: v, chatUrl: c }))}
        >
          Save links
        </button>
        {error && <span style={{ fontSize: 13, color: 'var(--color-accent-700)' }}>{error}</span>}
      </div>
    </div>
  )
}

// ── Photo albums ─────────────────────────────────────────────────────────────

export function AlbumsEditor({ albums }: { albums: { id: string; year: number; url: string }[] }) {
  const { pending, error, run } = useAction()
  return (
    <div className="card elev-sm bg-white" style={{ padding: '24px 24px 22px' }}>
      <h2 className="m-0 text-[22px]">Photo albums</h2>
      <p className="mt-2" style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--color-neutral-700)' }}>
        Each year has its own Google&nbsp;Photos album. Paste the share link for each year; leave it
        blank until you&rsquo;ve created it.
      </p>
      <div className="mt-4.5 flex flex-col gap-3">
        {albums.map((a) => (
          <AlbumRow key={a.id} album={a} run={run} pending={pending} />
        ))}
        <button
          className="btn btn-secondary mt-1 self-start"
          disabled={pending}
          style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}
          onClick={() => run(() => addAlbumYear())}
        >
          <PlusIcon />
          Add a year
        </button>
        {error && <span style={{ fontSize: 13, color: 'var(--color-accent-700)' }}>{error}</span>}
      </div>
    </div>
  )
}

function AlbumRow({
  album,
  run,
  pending,
}: {
  album: { id: string; year: number; url: string }
  run: (fn: () => Promise<ActionResult>) => void
  pending: boolean
}) {
  const [url, setUrl] = useState(album.url)
  return (
    <div className="flex items-center gap-2.5">
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 19, minWidth: 52 }}>{album.year}</span>
      <input
        style={{ ...inputStyle, flex: 1 }}
        value={url}
        placeholder="Paste Google Photos link…"
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => url !== album.url && run(() => setAlbumUrl({ id: album.id, url }))}
      />
      <button className="btn btn-icon shrink-0" title="Remove year" disabled={pending} onClick={() => run(() => removeAlbum({ id: album.id }))}>
        <TrashIcon />
      </button>
    </div>
  )
}

// ── Upcoming events ──────────────────────────────────────────────────────────

interface EventItem {
  id: string
  startDate: string | null
  endDate: string | null
  time: string
  description: string
  meetingLink: string | null
}

export function EventsEditor({ events }: { events: EventItem[] }) {
  const { pending, error, run } = useAction()
  return (
    <div className="card elev-sm bg-white" style={{ padding: '24px 24px 22px', gridColumn: '1 / -1' }}>
      <h2 className="m-0 text-[22px]">Upcoming events</h2>
      <p className="mt-2" style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--color-neutral-700)' }}>
        A short list shown on the home page. Each event is either a single day (with an optional
        time) or a multi-day range — set an end date to make it a range. Add a one-line description
        and an optional Zoom or Teams link for calls.
      </p>
      <div className="mt-4.5 flex flex-col gap-3.5">
        {events.map((ev) => (
          <EventRow key={ev.id} event={ev} run={run} pending={pending} />
        ))}
        <button
          className="btn btn-secondary self-start"
          disabled={pending}
          style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}
          onClick={() => run(() => addEvent())}
        >
          <PlusIcon />
          Add an event
        </button>
        {error && <span style={{ fontSize: 13, color: 'var(--color-accent-700)' }}>{error}</span>}
      </div>
    </div>
  )
}

function EventRow({
  event,
  run,
  pending,
}: {
  event: EventItem
  run: (fn: () => Promise<ActionResult>) => void
  pending: boolean
}) {
  const [startDate, setStartDate] = useState(event.startDate ?? '')
  const [endDate, setEndDate] = useState(event.endDate ?? '')
  const [time, setTime] = useState(event.time)
  const [description, setDescription] = useState(event.description)
  const [link, setLink] = useState(event.meetingLink ?? '')

  // A time only applies to a single day; a date range clears/disables it.
  const isRange = !!(startDate && endDate)

  const save = () =>
    run(() =>
      updateEvent({
        id: event.id,
        startDate,
        endDate,
        time: isRange ? '' : time,
        description,
        meetingLink: link,
      }),
    )

  return (
    <div className="flex flex-wrap items-end gap-2.5 pb-3.5" style={{ borderBottom: '1px solid var(--color-neutral-200)' }}>
      <label style={{ ...labelStyle, flex: '1 1 130px' }}>
        Start date
        <input style={inputStyle} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onBlur={save} />
      </label>
      <label style={{ ...labelStyle, flex: '1 1 130px' }}>
        End date <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(blank = single day)</span>
        <input style={inputStyle} type="date" min={startDate || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} onBlur={save} />
      </label>
      <label style={{ ...labelStyle, flex: '1 1 120px' }}>
        Time
        <input
          style={{ ...inputStyle, opacity: isRange ? 0.45 : 1 }}
          value={isRange ? '' : time}
          disabled={isRange}
          placeholder={isRange ? 'Single day only' : '7:00 PM ET'}
          onChange={(e) => setTime(e.target.value)}
          onBlur={save}
        />
      </label>
      <label style={{ ...labelStyle, flex: '3 1 220px' }}>
        Description
        <input style={inputStyle} value={description} placeholder="What’s happening" onChange={(e) => setDescription(e.target.value)} onBlur={save} />
      </label>
      <label style={{ ...labelStyle, flex: '3 1 220px' }}>
        Zoom / Teams link (optional)
        <input style={inputStyle} value={link} placeholder="https://zoom.us/j/…" onChange={(e) => setLink(e.target.value)} onBlur={save} />
      </label>
      <button className="btn btn-icon shrink-0" title="Remove event" disabled={pending} onClick={() => run(() => removeEvent({ id: event.id }))}>
        <TrashIcon />
      </button>
    </div>
  )
}
