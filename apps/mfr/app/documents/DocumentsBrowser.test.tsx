// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react'
import { DocumentsBrowser } from './DocumentsBrowser'
import type { DriveEntry } from '@/lib/drive/client'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}))

afterEach(() => cleanup())

function entry(over: Partial<DriveEntry> = {}): DriveEntry {
  return {
    id: 'f1',
    name: 'Bylaws.pdf',
    mimeType: 'application/pdf',
    isFolder: false,
    size: 2048,
    modifiedTime: '2024-08-24T00:00:00Z',
    ...over,
  }
}

describe('DocumentsBrowser', () => {
  it('renders a folder as a navigation link', () => {
    render(
      <DocumentsBrowser
        entries={[
          entry({
            id: 'd1',
            name: 'Minutes',
            isFolder: true,
            mimeType: 'application/vnd.google-apps.folder',
            size: null,
          }),
        ]}
      />,
    )
    const link = screen.getByRole('link', { name: /Minutes/ })
    expect(link.getAttribute('href')).toBe('/documents?folder=d1')
    expect(screen.getByText('Open')).toBeTruthy()
  })

  it('shows View + Download for a viewable file and opens the modal on View', () => {
    render(<DocumentsBrowser entries={[entry()]} />)
    // Two ways to view (whole-row button + explicit action), and a Download link.
    expect(screen.getByRole('button', { name: 'View' })).toBeTruthy()
    const dl = screen.getByRole('link', { name: 'Download' })
    expect(dl.getAttribute('href')).toBe('/api/documents/download?id=f1')
    // No dialog until opened.
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    const dialog = within(screen.getByRole('dialog'))
    // PDF renders in an iframe pointed at the inline URL.
    const frame = document.querySelector('iframe') as HTMLIFrameElement
    expect(frame.title).toBe('Bylaws.pdf')
    expect(frame.getAttribute('src')).toBe('/api/documents/download?id=f1&inline=1')
    expect(dialog.getByRole('link', { name: /open in new tab/i })).toBeTruthy()
  })

  it('renders an image file in an <img>, not an iframe', () => {
    render(
      <DocumentsBrowser
        entries={[entry({ id: 'p1', name: 'photo.jpg', mimeType: 'image/jpeg' })]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    const img = within(screen.getByRole('dialog')).getByAltText('photo.jpg') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/api/documents/download?id=p1&inline=1')
  })

  it('makes a non-viewable file download-only (no View, no modal)', () => {
    render(
      <DocumentsBrowser
        entries={[
          entry({
            id: 'w1',
            name: 'Notes.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          }),
        ]}
      />,
    )
    expect(screen.queryByRole('button', { name: /view/i })).toBeNull()
    const link = screen.getByRole('link', { name: /Notes\.docx/ })
    expect(link.getAttribute('href')).toBe('/api/documents/download?id=w1')
    expect(screen.getByText('Download')).toBeTruthy()
  })

  it('falls back to a download link when the preview fails to load', () => {
    render(
      <DocumentsBrowser
        entries={[entry({ id: 'p1', name: 'photo.jpg', mimeType: 'image/jpeg' })]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.error(dialog.getByAltText('photo.jpg'))
    const fallback = dialog.getByRole('link', { name: /download instead/i })
    expect(fallback.getAttribute('href')).toBe('/api/documents/download?id=p1')
  })

  it('closes the modal on Escape and on backdrop click', () => {
    render(<DocumentsBrowser entries={[entry()]} />)

    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    // Re-open, then click the backdrop (the dialog element itself).
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
