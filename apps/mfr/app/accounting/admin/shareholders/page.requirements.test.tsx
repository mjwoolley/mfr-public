import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// Requirements coverage for CAP-046 (requirements/accounting/shareholder-records.md)
// and the list display of CAP-047 links. Renders the admin Shareholders list
// against mocked rows. Alphabetical ordering is the query's job and is covered
// against a real DB in tests/accounting-integration/requirements-records-shareholders.test.ts.

const { shareholderFindMany, linkCandidatesMock } = vi.hoisted(() => ({
  shareholderFindMany: vi.fn(),
  linkCandidatesMock: vi.fn(),
}))

vi.mock('@/lib/db/client', () => ({
  db: { query: { shareholder: { findMany: shareholderFindMany } } },
}))
vi.mock('@/lib/accounting/linkCandidates', () => ({ getLinkCandidates: linkCandidatesMock }))

import AdminShareholdersPage from './page'

const michele = { id: 'u-michele', email: 'michele@family.org', name: 'Michele Anderegg' }

function sh(over: Record<string, unknown>) {
  return {
    id: 'sh-1',
    name: 'Ann Miller',
    email: null,
    active: true,
    userId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }
}

async function render(rows: unknown[]) {
  shareholderFindMany.mockResolvedValue(rows)
  linkCandidatesMock.mockResolvedValue({ byId: new Map([[michele.id, michele]]), unlinked: [] })
  return renderToStaticMarkup(await AdminShareholdersPage())
}

/** The <tr> for the shareholder whose name cell starts with `name`. */
function row(html: string, name: string) {
  const rows = html.match(/<tr[^>]*>.*?<\/tr>/g) ?? []
  const found = rows.find((r) => r.includes(`<span class="block font-semibold">${name}`))
  if (!found) throw new Error(`no row for ${name}`)
  return found
}

beforeEach(() => vi.clearAllMocks())

describe('CAP-046 Shareholder records — list page', () => {
  it('CAP-046 · The shareholder list — each row shows email or "No email", the login or "Not linked", and an Edit link', async () => {
    const html = await render([
      sh({ id: 'sh-ann', name: 'Ann Miller', email: 'ann@family.org' }),
      sh({ id: 'sh-ben', name: 'Ben Miller', email: null }),
      sh({
        id: 'sh-and',
        name: 'John and Michele Anderegg',
        email: 'john@family.org',
        userId: michele.id,
      }),
    ])

    expect(html).toContain(
      'Shareholder records. A login links automatically when its email matches — otherwise open Edit to pick one.',
    )

    const ann = row(html, 'Ann Miller')
    expect(ann).toContain('>ann@family.org</span>')
    expect(ann).toContain('<span class="text-muted">Not linked</span>')
    expect(ann).toMatch(
      /<a [^>]*href="\/accounting\/admin\/shareholders\/sh-ann\/edit"[^>]*>Edit<\/a>/,
    )

    const ben = row(html, 'Ben Miller')
    expect(ben).toContain('>No email</span>')

    const household = row(html, 'John and Michele Anderegg')
    expect(household).toContain('<span class="block">Michele Anderegg</span>')
    expect(household).toContain('>michele@family.org</span>')
    expect(household).not.toContain('Not linked')
  })

  it('CAP-046 · Two shareholders may share a name — both are listed', async () => {
    const html = await render([
      sh({ id: 'sh-a1', name: 'Ann Miller', email: 'ann1@family.org' }),
      sh({ id: 'sh-a2', name: 'Ann Miller', email: 'ann2@family.org' }),
    ])

    expect(html.match(/<span class="block font-semibold">Ann Miller<\/span>/g)).toHaveLength(2)
    expect(html).toContain('/accounting/admin/shareholders/sh-a1/edit')
    expect(html).toContain('/accounting/admin/shareholders/sh-a2/edit')
  })

  it('CAP-046 · No shareholders yet', async () => {
    const html = await render([])

    expect(html).toContain(
      '<td colSpan="3" class="text-muted py-6 text-center">No shareholders yet.</td>',
    )
  })

  it('CAP-046 · Admin deactivates a shareholder — the list shows her dimmed with "(inactive)"', async () => {
    const html = await render([sh({ id: 'sh-ann', name: 'Ann Miller', active: false })])

    const ann = row(html, 'Ann Miller')
    expect(ann).toMatch(/^<tr class="opacity-60">/)
    expect(ann).toContain(
      '<span class="block font-semibold">Ann Miller<span class="text-muted ml-1 text-xs font-normal">(inactive)</span></span>',
    )
  })

  it('CAP-046 · Admin reactivates a shareholder — she is listed normally again', async () => {
    const html = await render([sh({ id: 'sh-ann', name: 'Ann Miller', active: true })])

    const ann = row(html, 'Ann Miller')
    expect(ann).toMatch(/^<tr>/)
    expect(ann).not.toContain('(inactive)')
  })
})
