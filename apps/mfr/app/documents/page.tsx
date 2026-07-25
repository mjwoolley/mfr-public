// Members-only Documents page. Reads the shared Google Drive folder (and its
// subfolders) through the service-account Drive client and renders a native,
// navigable file browser. Members never touch Drive directly: folders navigate
// in-page via ?folder=<id>, files view inline or download through
// /api/documents/download, which proxies the bytes. Site auth (requireApproved)
// is the only gate. Row rendering + the inline viewer live in the client
// component DocumentsBrowser; this server component fetches and lays out.

import type { Metadata } from 'next'
import Link from 'next/link'
import { canManagePortalContent } from '@mfr/auth'
import { requireApproved } from '@/lib/authz'
import { getPortalSettings } from '@/lib/portal'
import {
  getDriveClient,
  extractDriveFolderId,
  DriveNotWithinRootError,
  type DriveEntry,
  type Crumb,
} from '@/lib/drive/client'
import { DocumentsBrowser } from './DocumentsBrowser'

export const metadata: Metadata = { title: 'Documents' }

// Route handlers/pages that read live Drive data must never be prerendered.
export const dynamic = 'force-dynamic'

const FolderIcon = () => (
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
  >
    <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
  </svg>
)

function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav
      aria-label="Folder path"
      className="mt-5.5 flex flex-wrap items-center gap-1.5 text-sm"
      style={{ color: 'color-mix(in srgb, var(--color-text) 62%, transparent)' }}
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        const href = i === 0 ? '/documents' : `/documents?folder=${crumb.id}`
        return (
          <span key={crumb.id} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            {isLast ? (
              <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{crumb.name}</span>
            ) : (
              <Link href={href} style={{ color: 'var(--color-accent-700)' }}>
                {crumb.name}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>
}) {
  const session = await requireApproved()
  const settings = await getPortalSettings()
  const rootId = extractDriveFolderId(settings.driveUrl)
  // Kept for the admin-only wording in the load-failed hint below.
  const isAdmin = canManagePortalContent(session.user.roles)

  const { folder } = await searchParams
  let currentId = folder?.trim() || rootId

  let entries: DriveEntry[] = []
  let crumbs: Crumb[] = []
  let loadFailed = false

  if (rootId) {
    const drive = getDriveClient()
    try {
      // A ?folder outside the configured root is silently reset to the root, so
      // the URL can never be used to browse arbitrary Drive folders.
      if (currentId !== rootId) {
        try {
          await drive.assertWithinRoot(currentId, rootId)
        } catch (err) {
          if (err instanceof DriveNotWithinRootError) currentId = rootId
          else throw err
        }
      }
      ;[entries, crumbs] = await Promise.all([
        drive.listFolder(currentId),
        drive.getFolderPath(currentId, rootId),
      ])
    } catch {
      loadFailed = true
    }
  }

  return (
    <section
      className="mx-auto max-w-5xl px-7 pt-6 pb-2"
      style={{ animation: 'fadeup .4s ease both' }}
    >
      <div className="mb-2">
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
          Bylaws, meeting notes, budgets and more &mdash; browse the folders below and open any file
          to view it here or download it. Everything is read straight from the family
          Google&nbsp;Drive.
        </p>
      </div>

      {rootId && !loadFailed && <Breadcrumb crumbs={crumbs} />}

      {/* Populated folder view */}
      {rootId && !loadFailed && entries.length > 0 && (
        <div className="card elev-sm bg-white mt-4" style={{ padding: 8 }}>
          <DocumentsBrowser entries={entries} />
        </div>
      )}

      {/* Empty folder */}
      {rootId && !loadFailed && entries.length === 0 && (
        <div className="card elev-sm bg-white mt-4 text-center" style={{ padding: '34px 28px' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20 }}>
            This folder is empty
          </div>
          <p
            className="mx-auto mt-2 max-w-md"
            style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--color-neutral-700)' }}
          >
            There&rsquo;s nothing here yet.
          </p>
        </div>
      )}

      {/* Load failed (Drive unreachable / not configured on the Drive side) */}
      {rootId && loadFailed && (
        <div className="card elev-sm bg-white mt-4 text-center" style={{ padding: '34px 28px' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20 }}>
            Documents are temporarily unavailable
          </div>
          <p
            className="mx-auto mt-2 max-w-md"
            style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--color-neutral-700)' }}
          >
            {isAdmin
              ? 'The site could not read the Drive folder. Check that GOOGLE_DRIVE_SA_KEY is set and the folder is shared with the service account.'
              : 'We could not load the family documents right now. Please try again in a little while.'}
          </p>
        </div>
      )}

      {/* No folder configured at all */}
      {!rootId && (
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
            <FolderIcon />
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
