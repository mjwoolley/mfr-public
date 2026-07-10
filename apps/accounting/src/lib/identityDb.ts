import { createIdentityDb } from "@mfr/auth";

// Module-load-time singleton (same pattern as lib/prisma.ts). Points at the
// shared @mfr/auth identity database — the same IDENTITY_DATABASE_URL value the
// reservations app uses, so both apps share one set of users/sessions.
const connectionString = process.env.IDENTITY_DATABASE_URL;
if (!connectionString) {
  throw new Error("IDENTITY_DATABASE_URL is not set");
}

export const identityDb = createIdentityDb(connectionString);
