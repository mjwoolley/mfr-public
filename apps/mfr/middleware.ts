// TEMPORARY — prod auto-rollback live test. 503s the public home page ONLY on the
// production deployment (VERCEL_ENV==='production'), so CI e2e (which has no
// VERCEL_ENV) stays green and the PR can merge, but the real prod smoke's critical
// `GET / → 200` check fails (exit 1) → alert issue + vercel rollback + revert PR.
// The auto-revert PR removes this. Scoped to `/` only.
import { NextResponse } from 'next/server'

export function middleware() {
  if (process.env.VERCEL_ENV === 'production') {
    return new NextResponse('smoke-break (prod rollback test)', { status: 503 })
  }
  return NextResponse.next()
}

export const config = { matcher: ['/'] }
