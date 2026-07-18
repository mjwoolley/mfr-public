// Seed (idempotent) the permanent smoke-test identity into a target DB, so smoke
// tests can authenticate via a DB-seeded session instead of Google OAuth (the app
// uses Auth.js database sessions — a valid session = a `sessions` row whose token
// matches the cookie). Mirrors e2e/global-setup.ts.
//
// The user is a PLAIN APPROVED MEMBER (no admin role) — least privilege. The
// session token is a STANDING LOGIN CREDENTIAL: it comes from SMOKE_SESSION_TOKEN
// (never hardcoded) and must be stored/rotated like a password. Anyone with it is
// signed in as this user, so treat prod's value as a secret.
//
// Usage: DIRECT_URL=... SMOKE_SESSION_TOKEN=... node scripts/seed-smoke-user.mjs

import postgres from 'postgres'

const url = process.env.DIRECT_URL
const token = process.env.SMOKE_SESSION_TOKEN
if (!url) throw new Error('DIRECT_URL is not set')
if (!token || token.length < 24)
  throw new Error('SMOKE_SESSION_TOKEN missing or too short (>=24 chars)')

// Stable identity so re-seeding any branch is idempotent.
const USER_ID = 'e5e0f1a2-0000-4000-8000-000000000001'
const EMAIL = 'smoke-test@millerfamilyreunions.org'
const NAME = 'Smoke Test (automated)'
const EXPIRES = new Date('2035-01-01T00:00:00Z')

const sql = postgres(url, { max: 1 })
try {
  await sql`
    INSERT INTO users (id, email, name, status)
    VALUES (${USER_ID}, ${EMAIL}, ${NAME}, 'approved')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, status = 'approved'
  `
  // Re-point the session token to this user (single canonical smoke session).
  await sql`DELETE FROM sessions WHERE user_id = ${USER_ID}`
  await sql`
    INSERT INTO sessions (session_token, user_id, expires)
    VALUES (${token}, ${USER_ID}, ${EXPIRES})
    ON CONFLICT (session_token) DO UPDATE SET user_id = EXCLUDED.user_id, expires = EXCLUDED.expires
  `
  const [u] = await sql`SELECT id, email, status FROM users WHERE email = ${EMAIL}`
  console.log('seeded smoke user:', u.id, u.email, u.status, '(plain approved member)')
} finally {
  await sql.end()
}
