import type { Metadata } from 'next'
import { requireApproved } from '@/lib/authz'
import { getPortalSettings } from '@/lib/portal'

export const metadata: Metadata = { title: 'Documents' }

export default async function DocumentsPage() {
  // Server-side gate: signed-out visitors are redirected to the single /sign-in
  // screen, so the folder contents AND the Open-in-Drive link only ever render
  // for an approved, signed-in member — a signed-out visitor never receives the URL.
  await requireApproved()
  const settings = await getPortalSettings()

  const drive = settings.driveUrl.trim()
  const driveId = drive.match(/[-\w]{25,}/)?.[0] ?? ''
  const embedUrl = driveId ? `https://drive.google.com/embeddedfolderview?id=${driveId}#list` : ''

  return (
    <section
      className="mx-auto max-w-5xl px-7 pt-6 pb-2"
      style={{ animation: 'fadeup .4s ease both' }}
    >
      <div className="mb-2 flex flex-wrap items-end gap-5">
        <div>
          <div
            className="text-xs font-bold uppercase"
            style={{ letterSpacing: '.22em', color: 'var(--color-accent-700)' }}
          >
            Shared files
          </div>
          <h1 className="mt-2.5" style={{ fontSize: 'clamp(34px,4.4vw,46px)', lineHeight: 1.05 }}>
            Family documents.
          </h1>
          <p
            className="mt-3 max-w-xl"
            style={{
              fontSize: 16,
              lineHeight: 1.65,
              color: 'color-mix(in srgb, var(--color-text) 78%, transparent)',
            }}
          >
            Everything in the family Google&nbsp;Drive folder &mdash; bylaws, meeting notes, budgets
            and more, including anything tucked inside subfolders. Open a file to view it, or head
            into Drive to add your own.
          </p>
        </div>
        {drive && (
          <a
            href={drive}
            target="_blank"
            rel="noopener"
            className="btn btn-primary ml-auto"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
            </svg>
            Open in Google Drive
          </a>
        )}
      </div>

      {embedUrl && (
        <div className="card elev-sm bg-white mt-5.5 overflow-hidden" style={{ padding: 10 }}>
          <iframe
            src={embedUrl}
            title="Family Google Drive folder"
            loading="lazy"
            style={{
              width: '100%',
              height: 640,
              border: 0,
              borderRadius: 12,
              background: '#fff',
              display: 'block',
            }}
          />
        </div>
      )}

      {!embedUrl && (
        <div className="card elev-sm bg-white mt-5.5 text-center" style={{ padding: '34px 28px' }}>
          <div
            className="mx-auto mb-3.5 flex items-center justify-center"
            style={{
              width: 52,
              height: 52,
              borderRadius: 999,
              background: 'var(--color-accent-2-100)',
              color: 'var(--color-accent-2-700)',
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
            </svg>
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20 }}>
            No Drive folder linked yet
          </div>
          <p
            className="mx-auto mt-2 max-w-md"
            style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--color-neutral-700)' }}
          >
            Set the shared Drive folder link in Admin and its contents &mdash; and any subfolders
            &mdash; will appear right here.
          </p>
        </div>
      )}
    </section>
  )
}
