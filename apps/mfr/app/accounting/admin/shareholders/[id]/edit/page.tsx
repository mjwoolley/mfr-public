// Admin edit-shareholder page: name/email/active form plus the control that
// links a Shareholder record to a Google login.
//
// The suggested/other split is computed here rather than in the client
// component, so the name-matching logic stays out of the browser bundle.

import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { shareholder as shareholderTable } from '@/lib/db/schema'
import { getLinkCandidates } from '@/lib/accounting/linkCandidates'
import { partitionByNameMatch } from '@/lib/accounting/nameMatch'
import { EditShareholderForm } from './edit-shareholder-form'
import { LinkLoginControl } from './link-login-control'

export default async function EditShareholderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const shareholder = await db.query.shareholder.findFirst({
    where: eq(shareholderTable.id, id),
  })
  if (!shareholder) notFound()

  const { byId, unlinked } = await getLinkCandidates()
  const linkedLogin = shareholder.userId ? (byId.get(shareholder.userId) ?? null) : null
  const { suggested, others } = partitionByNameMatch(unlinked, shareholder.name)

  return (
    <div>
      <h1 className="text-xl font-semibold">Edit shareholder</h1>
      <EditShareholderForm shareholder={shareholder} />
      <LinkLoginControl
        shareholderId={shareholder.id}
        shareholderName={shareholder.name}
        shareholderEmail={shareholder.email}
        linkedLogin={linkedLogin}
        suggested={suggested}
        others={others}
      />
    </div>
  )
}
