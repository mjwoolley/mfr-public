// Prisma client for integration tests, bound to the dedicated Neon test
// branch. Refuses to construct without TEST_DATABASE_URL — that guard is the
// only thing standing between the truncating setup step and a real database.

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is not set — integration tests must run against the dedicated Neon test branch, never the real database",
  );
}

const adapter = new PrismaNeon({ connectionString });

export const testDb = new PrismaClient({ adapter });
