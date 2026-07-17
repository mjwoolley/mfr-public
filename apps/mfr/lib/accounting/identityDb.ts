import { createIdentityDbFromEnv } from "@mfr/auth";

// Module-load-time singleton (same pattern as lib/prisma.ts). Points at the
// shared @mfr/auth identity database — the same IDENTITY_DATABASE_URL value
// the other apps use, so all three apps share one set of users/sessions.
export const identityDb = createIdentityDbFromEnv();
