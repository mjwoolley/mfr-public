// Vitest global setup for the integration project: truncates the business and
// shared-identity Neon *test* branches before the run. Destructive by design —
// the TEST_* env guards in testDb/testIdentityDb are what keep it away from
// real databases.

import postgres from "postgres";

export default async function setup() {
  const businessConnectionString = process.env.TEST_DIRECT_URL;
  if (!businessConnectionString) {
    throw new Error("TEST_DIRECT_URL is not set");
  }
  const identityConnectionString = process.env.TEST_IDENTITY_DIRECT_DATABASE_URL;
  if (!identityConnectionString) {
    throw new Error("TEST_IDENTITY_DIRECT_DATABASE_URL is not set");
  }

  // Single statement, CASCADE handles FK ordering (LedgerEntry and
  // TransactionApproval both cascade-delete from Transaction; Transaction
  // self-references via correctsTransactionId). RESTART IDENTITY is harmless
  // here (all PKs are cuid strings, no serial/identity columns) but included
  // for safety if that ever changes. Table names are unquoted-default Prisma
  // model names (no @@map in schema.prisma) so they must be double-quoted to
  // preserve case.
  const businessSql = postgres(businessConnectionString, { prepare: false });
  await businessSql`TRUNCATE TABLE "Shareholder", "Transaction", "LedgerEntry", "TransactionApproval", "Expense" RESTART IDENTITY CASCADE`;
  await businessSql.end();

  // users/accounts/sessions/verification_tokens live in the shared @mfr/auth
  // identity test branch (also used by reservations' integration tests) —
  // truncate it independently.
  const identitySql = postgres(identityConnectionString, { prepare: false });
  await identitySql`TRUNCATE TABLE sessions, accounts, verification_tokens, users RESTART IDENTITY CASCADE`;
  await identitySql.end();
}
