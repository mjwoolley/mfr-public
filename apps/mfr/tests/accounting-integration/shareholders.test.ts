import { describe, it, expect, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./testDb";
import { testIdentityDb } from "./testIdentityDb";
import { users } from "@mfr/auth";

// Same reasoning as harness.test.ts for mocking @/lib/auth.
vi.mock("@/lib/accounting/auth", () => ({ auth: vi.fn() }));

// These actions call revalidatePath()/redirect(), which read from Next's
// request-scoped store. redirect() throws a plain (catchable) Error even
// outside that context, which is exactly the control-flow signal these tests
// want — but revalidatePath() throws an unrelated "static generation store
// missing" invariant when called outside a real request. Mock it out so only
// the actions' own logic is under test.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Avoid making real network calls to SES during tests; the notification
// emails themselves aren't what this phase is testing.
vi.mock("@/lib/accounting/email", () => ({ sendEmail: vi.fn(), appUrl: (p: string) => p }));

import { auth } from "@/lib/accounting/auth";
import {
  createShareholder,
  updateShareholder,
  setShareholderActive,
  linkShareholderToUser,
  unlinkShareholder,
  type ActionState,
} from "@/actions/accounting/shareholders";
import { createContribution } from "@/actions/accounting/contributions";
import { getAllShareholderBalances } from "@/lib/accounting/ledger";

const ADMIN_SESSION = {
  user: {
    id: "admin-1",
    status: "approved",
    roles: { siteOwner: false, siteManager: false, accountingManager: true },
    shareholderId: null,
    email: "admin@example.com",
    name: "Admin",
  },
  expires: "2099-01-01",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const createdShareholderIds: string[] = [];
const createdUserIds: string[] = [];
const createdTransactionIds: string[] = [];

afterEach(async () => {
  vi.mocked(auth).mockReset();
  // Transactions first — LedgerEntry/TransactionApproval cascade from
  // Transaction, but LedgerEntry -> Shareholder has no cascade, so a
  // shareholder with ledger entries can't be deleted until those are gone.
  for (const id of createdTransactionIds) {
    await testDb.transaction.delete({ where: { id } }).catch(() => {});
  }
  createdTransactionIds.length = 0;
  for (const id of createdShareholderIds) {
    await testDb.shareholder.delete({ where: { id } }).catch(() => {});
  }
  createdShareholderIds.length = 0;
  for (const id of createdUserIds) {
    await testIdentityDb.delete(users).where(eq(users.id, id));
  }
  createdUserIds.length = 0;
});

describe("createShareholder — optional email (Phase 11)", () => {
  it("succeeds with no email, storing null rather than an empty string", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);

    const name = `No Email ${Date.now()}`;
    // Success path ends in redirect(), which throws — that's the expected
    // control-flow signal, not a failure. email: "" simulates the real form,
    // which always submits the (now-optional) email field, just empty —
    // never omitted entirely.
    await expect(createShareholder(undefined, fd({ name, email: "" }))).rejects.toThrow();

    const created = await testDb.shareholder.findFirst({ where: { name } });
    expect(created).not.toBeNull();
    expect(created?.email).toBeNull();
    createdShareholderIds.push(created!.id);
  });

  it("allows two different shareholders to both have a null email", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);

    const nameA = `Null Email A ${Date.now()}`;
    const nameB = `Null Email B ${Date.now()}`;
    await expect(createShareholder(undefined, fd({ name: nameA, email: "" }))).rejects.toThrow();
    await expect(createShareholder(undefined, fd({ name: nameB, email: "" }))).rejects.toThrow();

    const rows = await testDb.shareholder.findMany({ where: { name: { in: [nameA, nameB] } } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.email === null)).toBe(true);
    createdShareholderIds.push(...rows.map((r) => r.id));
  });

  it("still rejects a duplicate non-null email", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    const email = `dup-${Date.now()}-${Math.random()}@example.com`;

    await expect(
      createShareholder(undefined, fd({ name: "Original Holder", email })),
    ).rejects.toThrow();
    const original = await testDb.shareholder.findUnique({ where: { email } });
    expect(original).not.toBeNull();
    createdShareholderIds.push(original!.id);

    const result: ActionState = await createShareholder(
      undefined,
      fd({ name: "Duplicate Holder", email }),
    );
    expect(result?.error).toMatch(/already exists/);

    const dupe = await testDb.shareholder.findFirst({ where: { name: "Duplicate Holder" } });
    expect(dupe).toBeNull();
  });

  it("rejects a malformed (non-empty) email", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);

    const badResult = await createShareholder(
      undefined,
      fd({ name: "Bad Email Holder", email: "not-an-email" }),
    );
    expect(badResult?.error).toMatch(/valid email/i);
  });
});

describe("updateShareholder", () => {
  it("edits name/email in place and still enforces uniqueness against other shareholders", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);

    const holder = await testDb.shareholder.create({
      data: { name: "Editable Holder", email: `editable-${Date.now()}@example.com` },
    });
    createdShareholderIds.push(holder.id);
    const other = await testDb.shareholder.create({
      data: { name: "Other Holder", email: `other-${Date.now()}@example.com` },
    });
    createdShareholderIds.push(other.id);

    // Editing to its own email is fine (not a collision with itself).
    const ok = await updateShareholder(
      undefined,
      fd({ shareholderId: holder.id, name: "Renamed Holder", email: holder.email! }),
    );
    expect(ok?.error).toBeUndefined();
    const renamed = await testDb.shareholder.findUnique({ where: { id: holder.id } });
    expect(renamed?.name).toBe("Renamed Holder");

    // Editing to someone else's email is rejected.
    const collision = await updateShareholder(
      undefined,
      fd({ shareholderId: holder.id, name: "Renamed Holder", email: other.email! }),
    );
    expect(collision?.error).toMatch(/already exists/);
  });
});

describe("auto-link to an existing login by email (staging fix #7)", () => {
  it("links a newly created shareholder to a matching identity user", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);

    const email = `autolink-${Date.now()}@example.com`;
    const [identityUser] = await testIdentityDb
      .insert(users)
      .values({ email, status: "approved" })
      .returning();
    createdUserIds.push(identityUser.id);

    const name = `Auto Linked ${Date.now()}`;
    // Success path ends in redirect(), which throws — expected control-flow signal.
    await expect(createShareholder(undefined, fd({ name, email }))).rejects.toThrow();

    const created = await testDb.shareholder.findFirst({ where: { name } });
    expect(created?.userId).toBe(identityUser.id);
    createdShareholderIds.push(created!.id);
  });

  it("matches the identity email case-insensitively", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);

    const lower = `mixedcase-${Date.now()}@example.com`;
    const [identityUser] = await testIdentityDb
      .insert(users)
      .values({ email: lower, status: "approved" })
      .returning();
    createdUserIds.push(identityUser.id);

    const name = `Mixed Case ${Date.now()}`;
    // The form submits an upper-cased address; the action normalizes to lower
    // and the lookup is case-insensitive, so it still links.
    await expect(
      createShareholder(undefined, fd({ name, email: lower.toUpperCase() })),
    ).rejects.toThrow();

    const created = await testDb.shareholder.findFirst({ where: { name } });
    expect(created?.userId).toBe(identityUser.id);
    createdShareholderIds.push(created!.id);
  });

  it("leaves userId null when no identity user has that email", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);

    const name = `No Match ${Date.now()}`;
    await expect(
      createShareholder(undefined, fd({ name, email: `nomatch-${Date.now()}@example.com` })),
    ).rejects.toThrow();

    const created = await testDb.shareholder.findFirst({ where: { name } });
    expect(created?.userId).toBeNull();
    createdShareholderIds.push(created!.id);
  });

  it("links on edit when the email changes to a matching identity user", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);

    const holder = await testDb.shareholder.create({
      data: { name: "Edit Link Target", email: `before-${Date.now()}@example.com` },
    });
    createdShareholderIds.push(holder.id);

    const newEmail = `after-${Date.now()}@example.com`;
    const [identityUser] = await testIdentityDb
      .insert(users)
      .values({ email: newEmail, status: "approved" })
      .returning();
    createdUserIds.push(identityUser.id);

    const res = await updateShareholder(
      undefined,
      fd({ shareholderId: holder.id, name: holder.name, email: newEmail }),
    );
    expect(res?.error).toBeUndefined();
    const linked = await testDb.shareholder.findUnique({ where: { id: holder.id } });
    expect(linked?.userId).toBe(identityUser.id);
  });

  it("returns a friendly error when the matched login is already linked elsewhere", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);

    const email = `taken-${Date.now()}@example.com`;
    const [identityUser] = await testIdentityDb
      .insert(users)
      .values({ email, status: "approved" })
      .returning();
    createdUserIds.push(identityUser.id);

    // First shareholder claims the login by email.
    const first = await testDb.shareholder.create({
      data: { name: "First Claimant", email, userId: identityUser.id },
    });
    createdShareholderIds.push(first.id);

    // A second create with the SAME email would try to link the same login →
    // Shareholder.userId is @unique, so it fails friendly. (The email uniqueness
    // check fires first here, which is also a friendly error.)
    const result = await createShareholder(undefined, fd({ name: "Second Claimant", email }));
    expect(result?.error).toMatch(/already/i);
    const dupe = await testDb.shareholder.findFirst({ where: { name: "Second Claimant" } });
    expect(dupe).toBeNull();
  });
});

describe("setShareholderActive — reused as-is by the Edit page's Active/Inactive checkbox", () => {
  it("toggles the active flag", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);

    const holder = await testDb.shareholder.create({
      data: { name: "Togglable Holder", email: `toggle-${Date.now()}@example.com`, active: true },
    });
    createdShareholderIds.push(holder.id);

    await setShareholderActive(holder.id, false);
    expect((await testDb.shareholder.findUnique({ where: { id: holder.id } }))?.active).toBe(false);

    await setShareholderActive(holder.id, true);
    expect((await testDb.shareholder.findUnique({ where: { id: holder.id } }))?.active).toBe(true);
  });
});

describe("linkShareholderToUser / unlinkShareholder", () => {
  it("sets Shareholder.userId on link and clears it back to null on unlink", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);

    const shareholder = await testDb.shareholder.create({
      data: { name: "Link Target", email: `link-${Date.now()}@example.com` },
    });
    createdShareholderIds.push(shareholder.id);

    const [identityUser] = await testIdentityDb
      .insert(users)
      .values({ email: `identity-${Date.now()}@example.com`, status: "approved" })
      .returning();
    createdUserIds.push(identityUser.id);

    const linkResult = await linkShareholderToUser(shareholder.id, identityUser.id);
    expect(linkResult?.error).toBeUndefined();
    const linked = await testDb.shareholder.findUnique({ where: { id: shareholder.id } });
    expect(linked?.userId).toBe(identityUser.id);

    await unlinkShareholder(shareholder.id);
    const unlinked = await testDb.shareholder.findUnique({ where: { id: shareholder.id } });
    expect(unlinked?.userId).toBeNull();
  });

  it("returns a friendly error instead of a raw Prisma exception when the user is already linked elsewhere", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);

    const a = await testDb.shareholder.create({
      data: { name: "Holder A", email: `a-${Date.now()}@example.com` },
    });
    const b = await testDb.shareholder.create({
      data: { name: "Holder B", email: `b-${Date.now()}@example.com` },
    });
    createdShareholderIds.push(a.id, b.id);

    const [identityUser] = await testIdentityDb
      .insert(users)
      .values({ email: `shared-${Date.now()}@example.com`, status: "approved" })
      .returning();
    createdUserIds.push(identityUser.id);

    await linkShareholderToUser(a.id, identityUser.id);
    const result = await linkShareholderToUser(b.id, identityUser.id);
    expect(result?.error).toMatch(/already linked/i);

    const bRow = await testDb.shareholder.findUnique({ where: { id: b.id } });
    expect(bRow?.userId).toBeNull();
  });
});

describe("the `active` flag's pre-existing effect, now under real integration test coverage", () => {
  it("excludes inactive shareholders from getAllShareholderBalances (Reports)", async () => {
    const active = await testDb.shareholder.create({
      data: {
        name: `Active Holder ${Date.now()}`,
        email: `active-${Date.now()}@example.com`,
        active: true,
      },
    });
    const inactive = await testDb.shareholder.create({
      data: {
        name: `Inactive Holder ${Date.now()}`,
        email: `inactive-${Date.now()}@example.com`,
        active: false,
      },
    });
    createdShareholderIds.push(active.id, inactive.id);

    const { rows } = await getAllShareholderBalances();
    expect(rows.some((r) => r.shareholder.id === active.id)).toBe(true);
    expect(rows.some((r) => r.shareholder.id === inactive.id)).toBe(false);
  });

  it("blocks a new contribution for an inactive shareholder", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    const inactive = await testDb.shareholder.create({
      data: {
        name: `Inactive For Tx ${Date.now()}`,
        email: `inactivetx-${Date.now()}@example.com`,
        active: false,
      },
    });
    createdShareholderIds.push(inactive.id);

    const result = await createContribution(
      undefined,
      fd({ shareholderId: inactive.id, amount: "100" }),
    );
    expect(result?.error).toMatch(/inactive/i);

    const entries = await testDb.ledgerEntry.findMany({ where: { shareholderId: inactive.id } });
    expect(entries).toHaveLength(0);
  });

  it("allows a new contribution for an active shareholder", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    const active = await testDb.shareholder.create({
      data: {
        name: `Active For Tx ${Date.now()}`,
        email: `activetx-${Date.now()}@example.com`,
        active: true,
      },
    });
    createdShareholderIds.push(active.id);

    const result = await createContribution(
      undefined,
      fd({ shareholderId: active.id, amount: "100" }),
    );
    expect(result?.success).toBe(true);

    const entries = await testDb.ledgerEntry.findMany({ where: { shareholderId: active.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0].shares.toString()).toBe("100");
    createdTransactionIds.push(entries[0].transactionId);
  });
});
