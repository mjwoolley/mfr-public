'use client'

// CAP-048 floating Feedback control, rendered by the root layout for approved
// members only. The draft lives in this component, so closing and reopening the
// panel on the same page keeps it; a reload or navigation away may drop it.

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ModalDialog } from '@mfr/ui'
import {
  FEEDBACK_UNAVAILABLE,
  MAX_FEEDBACK_LENGTH,
  validateFeedbackMessage,
} from '@/lib/feedback/validation'

export const FEEDBACK_SENT = 'Thanks! Your Feedback was sent to the site admins.'

/** True while another full-screen dialog (e.g. the photo viewer) is open. */
function otherDialogOpen(): boolean {
  return Array.from(document.querySelectorAll('[aria-modal="true"], dialog[open]')).some(
    (el) => !el.closest('[data-feedback]'),
  )
}

function useOtherDialogOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const update = () => setOpen(otherDialogOpen())
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'aria-modal'],
    })
    return () => observer.disconnect()
  }, [])
  return open
}

export function FeedbackButton() {
  const pathname = usePathname()
  const hidden = useOtherDialogOpen()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // A ref, not state, so a second click in the same tick can't slip through.
  const inFlight = useRef(false)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open) {
      // After ModalDialog's showModal(), which runs after this child effect.
      const id = window.setTimeout(() => textareaRef.current?.focus(), 0)
      wasOpen.current = true
      return () => window.clearTimeout(id)
    }
    if (wasOpen.current) buttonRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!confirmation) return
    const id = window.setTimeout(() => setConfirmation(null), 6000)
    return () => window.clearTimeout(id)
  }, [confirmation])

  // Always mirror the native <dialog>: Escape closes it regardless of React
  // state, and refusing to follow would strand the member with no button and
  // no panel. An in-flight send keeps running and still clears the draft on
  // success; on failure the draft (and error) are waiting when they reopen.
  const close = useCallback(() => setOpen(false), [])

  async function send() {
    if (inFlight.current) return
    const check = validateFeedbackMessage(draft)
    if (!check.ok) {
      setError(check.error)
      return
    }
    inFlight.current = true
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: check.message, pagePath: pathname }),
      })
      if (res.ok) {
        // The box is read-only while sending, so the draft is exactly what went out.
        setDraft('')
        setOpen(false)
        setConfirmation(FEEDBACK_SENT)
        return
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(res.status === 400 && body?.error ? body.error : FEEDBACK_UNAVAILABLE)
    } catch {
      setError(FEEDBACK_UNAVAILABLE)
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  return (
    <div data-feedback>
      {!hidden && !open && (
        <button
          ref={buttonRef}
          type="button"
          aria-label="Feedback"
          onClick={() => {
            setConfirmation(null)
            setOpen(true)
          }}
          className="btn btn-primary fixed right-4 bottom-4 z-40 shadow-lg max-sm:!h-12 max-sm:!w-12 max-sm:!rounded-full max-sm:!p-0"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="sm:hidden"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="max-sm:hidden">Feedback</span>
        </button>
      )}
      {open && (
        <ModalDialog title="Feedback" onClose={close}>
          <form
            className="mt-3 flex w-[min(28rem,calc(100vw-4rem))] flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <label htmlFor="feedback-message" className="text-sm">
              Tell the site admins what&apos;s working, what&apos;s broken, or what you&apos;d like.
            </label>
            <textarea
              id="feedback-message"
              ref={textareaRef}
              className="input min-h-32"
              value={draft}
              // Frozen while the request is in flight: an edit mid-send can't be
              // told apart from an append, and the box must match what was sent.
              readOnly={sending}
              maxLength={MAX_FEEDBACK_LENGTH + 500}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'feedback-error' : undefined}
              onChange={(e) => {
                setDraft(e.target.value)
                if (error) setError(null)
              }}
            />
            {error && (
              <p id="feedback-error" role="alert" className="text-sm" style={{ color: '#b42318' }}>
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <button type="submit" className="btn btn-primary" disabled={sending}>
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        </ModalDialog>
      )}
      <div role="status" aria-live="polite">
        {confirmation && (
          <p className="fixed right-4 bottom-20 z-40 max-w-xs rounded-lg bg-white px-4 py-3 text-sm shadow-lg">
            {confirmation}
          </p>
        )}
      </div>
    </div>
  )
}
