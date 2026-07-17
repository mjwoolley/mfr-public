'use client'

import { useState } from 'react'
import { ModalDialog } from '@mfr/ui'

interface VenmoDialogButtonProps {
  /** Server-generated QR data URL encoding the Venmo link. */
  qrDataUrl: string
  venmoUrl: string
  venmoHandle: string
}

/**
 * "Contribute via Venmo" button + dialog. Rendered only when the Venmo env
 * config is present; the QR code is generated server-side and passed in.
 */
export function VenmoDialogButton({ qrDataUrl, venmoUrl, venmoHandle }: VenmoDialogButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className="btn btn-primary ml-auto" onClick={() => setOpen(true)}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3M20 14v.01M14 20h.01M20 20h.01M17 20h.01M20 17h.01" />
        </svg>
        Contribute via Venmo
      </button>

      {open && (
        <ModalDialog title="Contribute via Venmo" onClose={() => setOpen(false)}>
          <p className="text-muted m-0 text-sm">
            Scan with your phone&apos;s camera or the Venmo app to chip in toward this year&apos;s
            goal. Contributions are recorded to the ledger once received.
          </p>
          <div className="flex justify-center py-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL QR, no optimization possible */}
            <img
              src={qrDataUrl}
              alt="Venmo QR code"
              className="h-[210px] w-[210px]"
              style={{
                imageRendering: 'pixelated',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-divider)',
              }}
            />
          </div>
          <a
            href={venmoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-block font-bold no-underline"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Open Venmo — {venmoHandle}
          </a>
          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </ModalDialog>
      )}
    </>
  )
}
