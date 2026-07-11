'use client'

import { useEffect, useRef, type ReactNode } from 'react'

export interface ModalDialogProps {
  title: string
  /** Called when the dialog asks to close: Escape, backdrop click, or the × button. */
  onClose: () => void
  children: ReactNode
}

/**
 * The Organic dialog, on a native <dialog> element so focus trapping,
 * Escape-to-close, and focus return come from the platform. Render it
 * conditionally — mounting opens it:
 *
 *   {open && <ModalDialog title="…" onClose={() => setOpen(false)}>…</ModalDialog>}
 */
export function ModalDialog({ title, onClose, children }: ModalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="dialog-host"
      onClose={onClose}
      onClick={(e) => {
        // Only clicks on the host itself (i.e. the ::backdrop area) close;
        // the inner .dialog card swallows everything else.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="dialog" style={{ animation: 'popin .2s ease' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="dialog-title">{title}</div>
          <button
            type="button"
            className="btn btn-icon btn-ghost -mt-1 -mr-1"
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
