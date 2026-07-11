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
