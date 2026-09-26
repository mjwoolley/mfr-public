// Requirements coverage for CAP-012 Family documents (requirements/reunion/family-documents.md):
// the Documents page's folder view, breadcrumb, root restriction and its
// empty / unlinked / unreadable states. The Drive client is replaced by an
// in-memory fake (CI has no Drive key); extractDriveFolderId and
// DriveNotWithinRootError stay real so the page's own root logic is exercised.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DriveClient, DriveEntry, Crumb } from '@/lib/drive/client'

const { requireApprovedMock, settingsMock, driveMock } = vi.hoisted(() => ({
  requireApprovedMock: vi.fn(),
  settingsMock: vi.fn(),
  driveMock: {
    listFolder: vi.fn(),
    getFolderPath: vi.fn(),
    assertWithinRoot: vi.fn(),
    getFileMeta: vi.fn(),
    fetchFileContent: vi.fn(),
  },
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/authz', () => ({ requireApproved: requireApprovedMock }))
vi.mock('@/lib/portal', () => ({ getPortalSettings: settingsMock }))
vi.mock('@/lib/drive/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drive/client')>()
  return { ...actual, getDriveClient: () => driveMock as unknown as DriveClient }
})

import DocumentsPage from './page'
import { DriveNotWithinRootError } from '@/lib/drive/client'

const ROOT = 'ROOTFOLDERID0123456789abcdefgh'
const SUB = 'SUBFOLDERID0123456789abcdefghi'
const DEEP = 'DEEPFOLDERID0123456789abcdefgh'

const noRoles = { siteOwner: false, siteManager: false, accountingManager: false }
const member = { user: { id: 'u1', status: 'approved', roles: noRoles } }
const manager = { user: { id: 'u2', status: 'approved', roles: { ...noRoles, siteManager: true } } }
const owner = { user: { id: 'u3', status: 'approved', roles: { ...noRoles, siteOwner: true } } }

function settings(driveUrl: string) {
  return { id: 'singleton', reunionYear: 2026, driveUrl, venmoUrl: '', chatUrl: '' }
}

function entry(over: Partial<DriveEntry>): DriveEntry {
  return {
    id: 'f',
    name: 'file',
    mimeType: 'application/pdf',
    isFolder: false,
    size: null,
    modifiedTime: null,
    ...over,
  }
}

async function render(folder?: string) {
  return renderToStaticMarkup(await DocumentsPage({ searchParams: Promise.resolve({ folder }) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  requireApprovedMock.mockResolvedValue(member)
  settingsMock.mockResolvedValue(settings(`https://drive.google.com/drive/folders/${ROOT}`))
  driveMock.listFolder.mockResolvedValue([])
  driveMock.getFolderPath.mockResolvedValue([{ id: ROOT, name: 'Family Documents' }] as Crumb[])
  driveMock.assertWithinRoot.mockResolvedValue(undefined)
})

describe('CAP-012 Family documents — Documents page', () => {
  it('CAP-012 · Browsing the family folder', async () => {
    // listFolder owns the ordering (asserted in lib/drive/client.test.ts);
    // the page must render entries in exactly that order.
    driveMock.listFolder.mockResolvedValue([
      entry({
        id: 'd1',
        name: 'Budgets',
        isFolder: true,
        mimeType: 'application/vnd.google-apps.folder',
      }),
      entry({
        id: 'f1',
        name: 'Bylaws.pdf',
        size: 2048,
        modifiedTime: '2026-01-02T12:00:00Z',
      }),
      entry({
        id: 'f2',
        name: 'notes.txt',
        mimeType: 'text/plain',
        size: 3 * 1024 * 1024,
        modifiedTime: '2025-08-24T12:00:00Z',
      }),
    ])

    const html = await render()

    expect(html).toContain('Family documents.')
    expect(driveMock.listFolder).toHaveBeenCalledWith(ROOT)
    const order = ['Budgets', 'Bylaws.pdf', 'notes.txt'].map((n) => html.indexOf(n))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    // Each file shows its size and last-modified date.
    expect(html).toContain('2.0 KB · Jan 2, 2026')
    expect(html).toContain('3.0 MB · Aug 24, 2025')
  })

  it('CAP-012 · Opening a subfolder', async () => {
    driveMock.listFolder.mockResolvedValue([entry({ id: 'f9', name: 'Minutes 2025.pdf' })])
    driveMock.getFolderPath.mockResolvedValue([
      { id: ROOT, name: 'Family Documents' },
      { id: SUB, name: 'Meetings' },
      { id: DEEP, name: '2025' },
    ])

    const html = await render(DEEP)

    // That folder's contents are shown…
    expect(driveMock.assertWithinRoot).toHaveBeenCalledWith(DEEP, ROOT)
    expect(driveMock.listFolder).toHaveBeenCalledWith(DEEP)
    expect(html).toContain('Minutes 2025.pdf')
    // …and the folder path links back to every folder above it.
    expect(html).toContain('aria-label="Folder path"')
    expect(html).toMatch(/<a href="\/documents"[^>]*>Family Documents<\/a>/)
    expect(html).toMatch(new RegExp(`<a href="/documents\\?folder=${SUB}"[^>]*>Meetings</a>`))
    // The current folder is plain text, not a link.
    expect(html).not.toContain(`href="/documents?folder=${DEEP}"`)
    expect(html).toContain('>2025</span>')
  })

  it('CAP-012 · Only the family folder can be browsed', async () => {
    driveMock.assertWithinRoot.mockRejectedValue(new DriveNotWithinRootError('STRAY'))
    driveMock.listFolder.mockResolvedValue([entry({ id: 'f1', name: 'Bylaws.pdf' })])

    const html = await render('STRAYFOLDERID0123456789abcdefg')

    // Reset to the top of the family folder, never the outside one.
    expect(driveMock.listFolder).toHaveBeenCalledTimes(1)
    expect(driveMock.listFolder).toHaveBeenCalledWith(ROOT)
    expect(driveMock.getFolderPath).toHaveBeenCalledWith(ROOT, ROOT)
    expect(html).toContain('Bylaws.pdf')
    expect(html).not.toContain('temporarily unavailable')
  })

  it('CAP-012 · Empty folder', async () => {
    driveMock.listFolder.mockResolvedValue([])
    const html = await render()
    expect(html).toContain('This folder is empty')
  })

  it('CAP-012 · No folder linked yet', async () => {
    settingsMock.mockResolvedValue(settings(''))
    const html = await render()
    expect(html).toContain('No Drive folder linked yet')
    expect(driveMock.listFolder).not.toHaveBeenCalled()
    expect(html).not.toContain('This folder is empty')
  })

  it('CAP-012 · The folder cannot be read right now (member)', async () => {
    driveMock.listFolder.mockRejectedValue(new Error('Drive 403'))
    const html = await render()
    expect(html).toContain('Documents are temporarily unavailable')
    expect(html).toContain(
      'We could not load the family documents right now. Please try again in a little while.',
    )
    expect(html).not.toContain('GOOGLE_DRIVE_SA_KEY')
  })

  it.each([
    ['site owner', owner],
    ['site manager', manager],
  ])(
    'CAP-012 · The folder cannot be read right now (%s is told to check Drive access)',
    async (_role, session) => {
      requireApprovedMock.mockResolvedValue(session)
      driveMock.listFolder.mockRejectedValue(new Error('Drive 403'))
      const html = await render()
      expect(html).toContain('Documents are temporarily unavailable')
      expect(html).toContain('shared with the service account')
      expect(html).not.toContain('We could not load the family documents right now')
    },
  )
})
