// Members-only Documents page. Reads the shared Google Drive folder (and its
// subfolders) through the service-account Drive client and renders a native,
// navigable file browser. Members never touch Drive directly: folders navigate
// in-page via ?folder=<id> and files download through /api/documents/download,
// which proxies the bytes. Site auth (requireApproved) is the only gate.

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

export const metadata: Metadata = { title: 'Documents' }

// Route handlers/pages that read live Drive data must never be prerendered.
export const dynamic = 'force-dynamic'

function formatBytes(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

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

const FileIcon = () => (
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
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
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

function EntryRow({ entry }: { entry: DriveEntry }) {
  const meta = [formatBytes(entry.size), formatDate(entry.modifiedTime)].filter(Boolean).join(' · ')
  const href = entry.isFolder
    ? `/documents?folder=${entry.id}`
    : `/api/documents/download?id=${entry.id}`
  const inner = (
    <>
      <span
        className="flex items-center justify-center shrink-0"
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: entry.isFolder ? 'var(--color-accent-2-100)' : 'var(--color-neutral-100)',
          color: entry.isFolder ? 'var(--color-accent-2-700)' : 'var(--color-neutral-700)',
        }}
      >
        {entry.isFolder ? <FolderIcon /> : <FileIcon />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate" style={{ fontWeight: 600, color: 'var(--color-text)' }}>
          {entry.name}
        </span>
        {meta && (
          <span className="block text-xs" style={{ color: 'var(--color-neutral-700)' }}>
            {meta}
          </span>
        )}
      </span>
      <span className="shrink-0 text-xs" style={{ color: 'var(--color-neutral-700)' }}>
        {entry.isFolder ? 'Open' : 'Download'}
      </span>
    </>
  )
  const className = 'doc-row flex items-center gap-3.5 px-3.5 py-2.5'
  const style = { borderRadius: 12 } as const
  return entry.isFolder ? (
    <Link href={href} className={className} style={style}>
      {inner}
    </Link>
  ) : (
    <a href={href} className={className} style={style}>
      {inner}
    </a>
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
            Bylaws, meeting notes, budgets and more &mdash; browse the folders below and open any
            file to download it. Everything is read straight from the family Google&nbsp;Drive.
          </p>
        </div>
        {isAdmin && settings.driveUrl && (
          <a
            href={settings.driveUrl}
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
            Manage in Google Drive
          </a>
        )}
      </div>

      {rootId && !loadFailed && <Breadcrumb crumbs={crumbs} />}

      {/* Populated folder view */}
      {rootId && !loadFailed && entries.length > 0 && (
        <div className="card elev-sm bg-white mt-4" style={{ padding: 8 }}>
          <div className="flex flex-col">
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </div>
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
