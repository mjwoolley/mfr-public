// Admin → Shareholders: every shareholder record and the login (if any) it is
// linked to. Deliberately three narrow columns with no minimum width — this is
// read on phones, and the previous five-column layout forced a horizontal
// scroll. Linking happens on the Edit screen, which has room for the picker.

import Link from 'next/link'
import { db } from '@/lib/db/client'
import { shareholder } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import { getLinkCandidates } from '@/lib/accounting/linkCandidates'

export default async function AdminShareholdersPage() {
  const [shareholders, { byId: loginsById }] = await Promise.all([
    db.query.shareholder.findMany({ orderBy: [asc(shareholder.name)] }),
    getLinkCandidates(),
  ])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted m-0 text-sm">
          Shareholder records. A login links automatically when its email matches — otherwise open
          Edit to pick one.
        </p>
        <Link
          href="/accounting/admin/shareholders/new"
          className="btn btn-primary flex-none no-underline"
        >
          Add shareholder
        </Link>
      </div>

      <div className="card elev-sm bg-white px-3 pt-2 pb-1 sm:px-5">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Login</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shareholders.map((s) => {
              const login = s.userId ? loginsById.get(s.userId) : undefined
              return (
                <tr key={s.id} className={s.active ? undefined : 'opacity-60'}>
                  <td className="font-semibold">
                    {s.name}
                    {!s.active && (
                      <span className="text-muted ml-1 text-xs font-normal">(inactive)</span>
                    )}
                  </td>
                  <td>
                    {s.userId ? (
                      <>
                        <span className="block">{login?.name ?? 'Linked'}</span>
                        {/* break-all: one long unbroken address is the only thing
                            left that can push this table wider than a phone. */}
                        <span className="text-muted block text-xs break-all">
                          {login?.email ?? '—'}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">Not linked</span>
                    )}
                  </td>
                  <td className="text-right align-top">
                    <Link
                      href={`/accounting/admin/shareholders/${s.id}/edit`}
                      className="font-semibold underline underline-offset-[3px]"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              )
            })}
            {shareholders.length === 0 && (
              <tr>
                <td colSpan={3} className="text-muted py-6 text-center">
                  No shareholders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
