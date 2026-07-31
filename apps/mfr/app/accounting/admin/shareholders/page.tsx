import Link from 'next/link'
import { db } from '@/lib/db/client'
import { shareholder } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import { listUsersWithRoles } from '@/lib/users'
import { LinkShareholderButton, type LinkCandidate } from './link-shareholder-button'

export default async function AdminShareholdersPage() {
  // The family is a few dozen logins, so the whole candidate list is sent with
  // the page rather than fetched per dialog — the Link dialog then filters and
  // name-matches client-side with no round trip.
  const [shareholders, users] = await Promise.all([
    db.query.shareholder.findMany({ orderBy: [asc(shareholder.name)] }),
    listUsersWithRoles(),
  ])

  const shareholderByUserId = new Map(
    shareholders.filter((s) => s.userId).map((s) => [s.userId as string, s]),
  )
  const approvedUsers = users.filter((u) => u.status === 'approved')

  const candidates: LinkCandidate[] = approvedUsers.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    // Shareholder.userId is unique, so a login already spoken for can't be
    // linked again — surface that in the dialog instead of failing on submit.
    linkedTo: shareholderByUserId.get(u.id)?.name ?? null,
  }))
  const userById = new Map(users.map((u) => [u.id, u]))

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-muted m-0 text-sm">
          Shareholder records — a login links automatically when its email matches, or use Link to
          pick one by name.
        </p>
        <Link
          href="/accounting/admin/shareholders/new"
          className="btn btn-primary flex-none no-underline"
        >
          Add shareholder
        </Link>
      </div>

      <div className="card elev-sm bg-white px-5 pt-2 pb-1">
        <div className="overflow-x-auto">
          <table className="table min-w-[560px]">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Login linked</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shareholders.map((s) => {
                const linkedUser = s.userId ? userById.get(s.userId) : undefined
                const linkedLabel = s.userId ? (linkedUser?.email ?? 'a login') : null
                return (
                  <tr key={s.id}>
                    <td className="font-semibold">{s.name}</td>
                    <td className="text-muted">{s.email ?? '—'}</td>
                    <td>
                      {linkedLabel ? (
                        <span className="tag tag-accent-2" title={linkedLabel}>
                          Linked
                        </span>
                      ) : (
                        <span className="tag tag-neutral">Not yet signed in</span>
                      )}
                    </td>
                    <td>
                      {s.active ? (
                        <span className="tag tag-accent-2">Active</span>
                      ) : (
                        <span className="tag tag-neutral">Inactive</span>
                      )}
                    </td>
                    <td className="text-right">
                      <span className="flex items-center justify-end gap-3">
                        <LinkShareholderButton
                          shareholderId={s.id}
                          shareholderName={s.name}
                          linkedLabel={linkedLabel}
                          candidates={candidates}
                        />
                        <Link
                          href={`/accounting/admin/shareholders/${s.id}/edit`}
                          className="font-semibold underline underline-offset-[3px]"
                        >
                          Edit
                        </Link>
                      </span>
                    </td>
                  </tr>
                )
              })}
              {shareholders.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted py-6 text-center">
                    No shareholders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
