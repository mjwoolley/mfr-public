// Shared-identity DB client for integration tests, bound to the identity test
// branch (same guard rationale as testDb.ts).

import { createIdentityDb } from "@mfr/auth";

const connectionString = process.env.TEST_IDENTITY_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "TEST_IDENTITY_DATABASE_URL is not set — integration tests must run against the dedicated identity test branch, never the real database",
  );
}

export const testIdentityDb = createIdentityDb(connectionString);
