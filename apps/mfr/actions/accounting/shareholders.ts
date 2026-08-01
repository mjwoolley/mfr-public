'use server'

// Admin CRUD for Shareholder records plus login linking/unlinking against the
// shared identity DB. Shareholders exist independently of Google logins; the
// link can be made automatically (by email, here and at sign-in) or manually
// (via the edit page's search control).

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq, ilike } from 'drizzle-orm'
import { users } from '@mfr/auth'
import { db } from '@/lib/db/client'
import { shareholder } from '@/lib/db/schema'
import { identityDb } from '@/lib/accounting/identityDb'
import { requireAdmin } from '@/lib/accounting/authz'

// Looks up an identity-DB user id by exact (case-insensitive) email, so a newly
// created/edited shareholder can be linked to their login straight away — the
// same identityDb/users pattern the shareholder-search route uses. Returns null
// when no user has that email. (`extendSession` in lib/auth.ts is the reverse
// fallback: it links by email at sign-in when no link exists yet.)
async function findIdentityUserIdByEmail(email: string): Promise<string | null> {
  const [row] = await identityDb
    .select({ id: users.id })
    .from(users)
    .where(ilike(users.email, email))
    .limit(1)
  return row?.id ?? null
}

// Empty string (an omitted optional email in the form) becomes `null`, not
// `""` — Postgres's unique constraint on `email` allows any number of NULLs,
// but two empty strings would collide.
const emailField = z
  .string()
  .trim()
  .transform((v) => (v.length > 0 ? v.toLowerCase() : null))
  .refine((v) => v === null || z.email().safeParse(v).success, {
    message: 'Enter a valid email',
  })

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: emailField,
})

export type ActionState = { error?: string } | undefined

export async function createShareholder(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin()

  const parsed = createSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { name, email } = parsed.data

  // Only pre-check uniqueness when an email was actually given — Postgres
  // allows multiple NULLs under the unique constraint, so there's nothing to
  // check (and calling findFirst with a null email would be meaningless).
  if (email) {
    const existing = await db.query.shareholder.findFirst({
      where: eq(shareholder.email, email),
    })
    if (existing) {
      return { error: 'A shareholder with that email already exists' }
    }
  }

  // If an identity user already exists with this email, link them on create so
  // the shareholder doesn't have to be linked by hand afterward.
  const userId = email ? await findIdentityUserIdByEmail(email) : null

  try {
    await db.insert(shareholder).values({ name, email, userId })
  } catch (err) {
    // Shareholder.userId is @unique — the matched login may already belong to a
    // different shareholder. Fail friendly rather than with a raw DB error.
    // Drizzle wraps the driver error, so the Postgres SQLSTATE (23505 =
    // unique_violation) surfaces on `err.cause`, not the top-level error.
    const code =
      (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code
    if (code === '23505') {
      return { error: 'That login is already linked to a different shareholder' }
    }
    throw err
  }

  revalidatePath('/accounting/admin/shareholders')
  redirect('/accounting/admin/shareholders')
}

const updateSchema = z.object({
  shareholderId: z.string().min(1),
  name: z.string().trim().min(1, 'Name is required'),
  email: emailField,
})

/** Edits a shareholder's name/email in place (stays on the Edit page). */
export async function updateShareholder(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin()

  const parsed = updateSchema.safeParse({
    shareholderId: formData.get('shareholderId'),
    name: formData.get('name'),
    email: formData.get('email'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { shareholderId, name, email } = parsed.data

  const current = await db.query.shareholder.findFirst({
    where: eq(shareholder.id, shareholderId),
  })
  if (!current) {
    return { error: 'Shareholder not found' }
  }

  if (email) {
    const existing = await db.query.shareholder.findFirst({
      where: eq(shareholder.email, email),
    })
    if (existing && existing.id !== shareholderId) {
      return { error: 'A shareholder with that email already exists' }
    }
  }

  // When the email changes to one that matches an identity user, link that
  // login now. Only re-link on an actual change so a manual link is preserved,
  // and never clear an existing link just because the new email has no user.
  let userId = current.userId
  if (email && email !== current.email) {
    const found = await findIdentityUserIdByEmail(email)
    if (found) userId = found
  }

  try {
    await db
      .update(shareholder)
      .set({ name, email, userId })
      .where(eq(shareholder.id, shareholderId))
  } catch (err) {
    // Drizzle wraps the driver error, so the Postgres SQLSTATE (23505 =
    // unique_violation) surfaces on `err.cause`, not the top-level error.
    const code =
      (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code
    if (code === '23505') {
      return { error: 'That login is already linked to a different shareholder' }
    }
    throw err
  }

  revalidatePath('/accounting/admin/shareholders')
  revalidatePath(`/accounting/admin/shareholders/${shareholderId}/edit`)
}

export async function setShareholderActive(shareholderId: string, active: boolean) {
  await requireAdmin()
  await db.update(shareholder).set({ active }).where(eq(shareholder.id, shareholderId))
  revalidatePath('/accounting/admin/shareholders')
  revalidatePath(`/accounting/admin/shareholders/${shareholderId}/edit`)
}

/**
 * Links a shareholder to an identity-DB login, optionally copying that login's
 * email onto the record.
 *
 * The email rule, re-derived here rather than trusted from the caller (the
 * caller's flag only answers the "they differ" case):
 *
 *   - shareholder has no email  -> copy it, no questions asked
 *   - emails already match      -> nothing to do
 *   - they differ               -> copy only if `adoptEmail`, because a
 *                                  household row ("John and Michele Anderegg")
 *                                  legitimately carries the other spouse's
 *                                  address and must not lose it just to link
 *
 * Copying is worth doing: `extendSession` resolves by email *first* and only
 * then falls back to `userId`, so a record carrying the right address keeps
 * working even if the link is later cleared. The address is lowercased on the
 * way in — form-entered emails are stored lowercased and `extendSession`
 * lowercases before comparing, so a mixed-case Google address stored verbatim
 * would never match and the copy would silently achieve nothing.
 *
 * `Shareholder.userId` and `Shareholder.email` are both unique. A login already
 * attached elsewhere gives the usual friendly error; an email already held by
 * another shareholder refuses the whole operation (neither field is written)
 * and names the holder, since silently linking-but-not-copying would leave the
 * admin believing the address had moved.
 */
export async function linkShareholderToUser(
  shareholderId: string,
  userId: string,
  opts: { adoptEmail?: boolean } = {},
): Promise<{ error?: string } | undefined> {
  await requireAdmin()

  const current = await db.query.shareholder.findFirst({
    where: eq(shareholder.id, shareholderId),
  })
  if (!current) return { error: 'Shareholder not found' }

  const [login] = await identityDb
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  const loginEmail = login?.email?.trim().toLowerCase() || null

  const differs = !!loginEmail && !!current.email && loginEmail !== current.email
  const adopt = !!loginEmail && (current.email === null || (differs && opts.adoptEmail === true))

  if (adopt) {
    const holder = await db.query.shareholder.findFirst({
      where: eq(shareholder.email, loginEmail),
    })
    if (holder && holder.id !== shareholderId) {
      return {
        error: `"${holder.name}" already uses ${loginEmail}. Clear it there first, then link.`,
      }
    }
  }

  try {
    await db
      .update(shareholder)
      .set({ userId, ...(adopt ? { email: loginEmail } : {}) })
      .where(eq(shareholder.id, shareholderId))
  } catch (err) {
    // Drizzle wraps the driver error, so the Postgres SQLSTATE (23505 =
    // unique_violation) surfaces on `err.cause`, not the top-level error.
    const code =
      (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code
    if (code === '23505') {
      return { error: 'That login is already linked to a different shareholder' }
    }
    throw err
  }

  revalidatePath('/accounting/admin/shareholders')
  revalidatePath(`/accounting/admin/shareholders/${shareholderId}/edit`)
}

export async function unlinkShareholder(shareholderId: string) {
  await requireAdmin()
  await db.update(shareholder).set({ userId: null }).where(eq(shareholder.id, shareholderId))
  revalidatePath('/accounting/admin/shareholders')
  revalidatePath(`/accounting/admin/shareholders/${shareholderId}/edit`)
}
