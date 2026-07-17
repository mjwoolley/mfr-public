// Drizzle client for integration tests, bound to the dedicated Neon test
// branch. Refuses to construct without TEST_DATABASE_URL — that guard is the
// only thing standing between the truncating setup step and a real database.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is not set — integration tests must run against the dedicated Neon test branch, never the real database",
  );
}

// Neon's pooled connection is transaction-mode, which does not support prepared
// statements across connections — disable them.
const client = postgres(connectionString, { prepare: false });

export const testDb = drizzle(client, { schema });
