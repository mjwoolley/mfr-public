// Plain (non-"use server") module so these can be imported by the client
// SlidesEditor — a "use server" file may only export async functions.

export type ActionResult = { ok: true } | { error: string }

/** Max slides per collection — keeps rotations sane. */
export const SLIDE_CAP = 12
