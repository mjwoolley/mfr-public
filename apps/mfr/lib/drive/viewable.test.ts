import { describe, it, expect } from 'vitest'
import { viewerKind } from './viewable'
import { finalContentType } from './mime'

describe('viewerKind', () => {
  it('renders PDFs and plain text in the iframe viewer', () => {
    expect(viewerKind('application/pdf')).toBe('pdf')
    expect(viewerKind('text/plain')).toBe('pdf')
  })

  it('renders browser-native images', () => {
    for (const ct of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) {
      expect(viewerKind(ct)).toBe('image')
    }
  })

  it('renders mp4 video', () => {
    expect(viewerKind('video/mp4')).toBe('video')
  })

  it('treats non-native types as download-only (null)', () => {
    const downloadOnly = [
      'image/heic', // HEIC/HEIF — no native Chrome/Firefox support
      'image/heif',
      'image/tiff', // Chrome does not render TIFF inline
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'video/quicktime', // .mov
      'video/avi',
      'application/octet-stream',
      'application/zip',
    ]
    for (const ct of downloadOnly) expect(viewerKind(ct)).toBeNull()
  })

  it('never previews HTML or SVG (would execute script in our origin)', () => {
    expect(viewerKind('text/html')).toBeNull()
    expect(viewerKind('image/svg+xml')).toBeNull()
  })

  it('ignores charset parameters and casing', () => {
    expect(viewerKind('application/pdf; charset=binary')).toBe('pdf')
    expect(viewerKind('IMAGE/JPEG')).toBe('image')
    expect(viewerKind('Text/Plain')).toBe('pdf')
  })
})

describe('finalContentType → viewerKind (Google-native files)', () => {
  it('previews Google Docs, Slides, and Drawings (exported to PDF/PNG)', () => {
    expect(viewerKind(finalContentType('application/vnd.google-apps.document'))).toBe('pdf')
    expect(viewerKind(finalContentType('application/vnd.google-apps.presentation'))).toBe('pdf')
    expect(viewerKind(finalContentType('application/vnd.google-apps.drawing'))).toBe('image')
  })

  it('leaves Google Sheets download-only (exported to xlsx)', () => {
    expect(viewerKind(finalContentType('application/vnd.google-apps.spreadsheet'))).toBeNull()
  })

  it('passes binary types through unchanged', () => {
    expect(finalContentType('application/pdf')).toBe('application/pdf')
    expect(finalContentType('image/jpeg')).toBe('image/jpeg')
  })
})
