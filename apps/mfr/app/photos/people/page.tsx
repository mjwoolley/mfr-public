// Browse the gallery by contributor. Anyone (approved) can see what each person
// added; each tile shows its year, filename, and size/resolution. You can only
// edit/feature/delete your own photos (enforced in the grid + the actions).

import type { Metadata } from 'next'
import Link from 'next/link'
import { canManagePortalContent } from '@mfr/auth'
import { requireApproved } from '@/lib/authz'
import { getContributors } from '@/lib/photos/gallery'
import { GalleryGrid } from '../GalleryGrid'

export const metadata: Metadata = { title: 'Photos by person' }

export default async function ContributorsPage() {
  const session = await requireApproved()
  const contributors = await getContributors()
  const isContentAdmin = canManagePortalContent(session.user.roles)

  return (
    <section
      className="mx-auto max-w-5xl px-7 pt-6 pb-2"
      style={{ animation: 'fadeup .4s ease both' }}
    >
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div>
          <Link
            href="/photos"
            className="text-xs font-bold uppercase"
            style={{ letterSpacing: '.22em', color: 'var(--color-accent-700)' }}
          >
            &larr; All years
          </Link>
          <h1 className="mt-2.5" style={{ fontSize: 'clamp(34px,4.4vw,46px)', lineHeight: 1.05 }}>
            Photos by person.
          </h1>
        </div>
      </div>

      {contributors.length === 0 && (
        <p style={{ fontSize: 14, color: 'var(--color-neutral-600)' }}>
          No photos yet. Add some from any year&rsquo;s album.
        </p>
      )}

      {contributors.map((c) => (
        <div key={c.id} className="mb-8">
          <h2 className="mb-3 text-[20px]">
            {c.id === session.user.id ? `${c.name} (you)` : c.name}{' '}
            <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-neutral-600)' }}>
              · {c.photos.length} photo{c.photos.length === 1 ? '' : 's'}
            </span>
          </h2>
          <GalleryGrid
            photos={c.photos}
            currentUserId={session.user.id}
            isContentAdmin={isContentAdmin}
            showMeta
          />
        </div>
      ))}
    </section>
  )
}
