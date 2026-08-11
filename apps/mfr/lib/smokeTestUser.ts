// The automated smoke-test member's fixed user id. Keep in sync with
// scripts/seed-smoke-user.mjs (a plain .mjs script that can't import TS —
// the literal is deliberately duplicated there with a cross-reference).
// Used to keep the smoke user's rows out of the admin activity feed.
export const SMOKE_TEST_USER_ID = 'e5e0f1a2-0000-4000-8000-000000000001'
