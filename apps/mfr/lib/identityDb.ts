import { createIdentityDbFromEnv } from '@mfr/auth'

// Module-load-time singleton (same pattern as the other two apps'
// lib/identityDb.ts). Points at the shared @mfr/auth identity database — the
// same IDENTITY_DATABASE_URL value reservations and accounting use, so all
// three apps share one set of users/sessions.
export const identityDb = createIdentityDbFromEnv()
