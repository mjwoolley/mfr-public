import { describe, it, expect, afterEach, vi } from "vitest";

// Same reasoning as tests/integration/harness.test.ts: requireShareholder()/
// requireAuthorized()/requireAdmin() (and requirePortalApproved() underneath
// all three) call auth() from @/lib/auth, whose top-level NextAuth(...) call
// would otherwise instantiate a real identityDb client and pull in next-auth
// machinery that doesn't resolve under plain Vitest. Mocking the module lets
// each test hand the authz helpers whatever session it likes.
vi.mock("@/lib/accounting/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/accounting/auth";
import { requireShareholder, requireAuthorized, requireAdmin } from "@/lib/accounting/authz";

afterEach(() => {
  vi.mocked(auth).mockReset();
});

function session(overrides: {
  status?: "pending" | "approved" | "blocked";
  isAccountingAdmin?: boolean;
  shareholderId?: string | null;
}) {
  const { status = "approved", isAccountingAdmin = false, shareholderId = null } = overrides;
  return {
    user: {
      id: "u1",
      status,
      roles: { siteOwner: false, siteManager: false, accountingManager: isAccountingAdmin },
      shareholderId,
      email: "user@example.com",
    },
    expires: "2099-01-01",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// requireShareholder() gates dashboard/page.tsx and inbox/page.tsx.
describe("requireShareholder()", () => {
  it("resolves for a linked shareholder", async () => {
    vi.mocked(auth).mockResolvedValue(session({ shareholderId: "sh_1" }));
    const s = await requireShareholder();
    expect(s.user.shareholderId).toBe("sh_1");
  });

  it("redirects an approved-but-unlinked non-admin (the 'non-shareholders shouldn't access accounting' case)", async () => {
    vi.mocked(auth).mockResolvedValue(session({ shareholderId: null, isAccountingAdmin: false }));
    await expect(requireShareholder()).rejects.toThrow();
  });

  it("redirects an admin who is not themselves a linked shareholder — admin status alone isn't enough here", async () => {
    vi.mocked(auth).mockResolvedValue(session({ shareholderId: null, isAccountingAdmin: true }));
    await expect(requireShareholder()).rejects.toThrow();
  });
});

// requireAuthorized() gates reports/page.tsx and (as of Phase 12) the
// promoted activity/page.tsx (admin OR linked shareholder).
describe("requireAuthorized()", () => {
  it("resolves for an admin, even without a linked shareholder", async () => {
    vi.mocked(auth).mockResolvedValue(session({ isAccountingAdmin: true, shareholderId: null }));
    const s = await requireAuthorized();
    expect(s.user.roles.accountingManager).toBe(true);
  });

  it("resolves for a linked shareholder who is not an admin", async () => {
    vi.mocked(auth).mockResolvedValue(session({ isAccountingAdmin: false, shareholderId: "sh_1" }));
    const s = await requireAuthorized();
    expect(s.user.shareholderId).toBe("sh_1");
  });

  it("redirects an approved user who is neither an admin nor a linked shareholder", async () => {
    vi.mocked(auth).mockResolvedValue(session({ isAccountingAdmin: false, shareholderId: null }));
    await expect(requireAuthorized()).rejects.toThrow();
  });
});

// requireAdmin() gates everything under admin/* — transactions, and (as of
// Phase 11) the shareholders list/new/edit pages plus the promoted "Manage
// Shareholders" nav item's target route. It's one shared helper, so proving
// its redirect behavior once covers every admin/* route that calls it
// (already proven for the base case in harness.test.ts; reasserted here in
// the context of the routes this phase adds).
describe("requireAdmin()", () => {
  it("resolves for an admin", async () => {
    vi.mocked(auth).mockResolvedValue(session({ isAccountingAdmin: true }));
    const s = await requireAdmin();
    expect(s.user.roles.accountingManager).toBe(true);
  });

  it("redirects a non-admin away from admin/* (including admin/shareholders and admin/shareholders/[id]/edit)", async () => {
    vi.mocked(auth).mockResolvedValue(session({ isAccountingAdmin: false }));
    await expect(requireAdmin()).rejects.toThrow();
  });
});

// requirePortalApproved() is the shared prerequisite every helper above sits
// on top of — a pending/blocked user must never reach the
// shareholder/admin-specific logic at all.
describe("requirePortalApproved() prerequisite", () => {
  it("redirects a blocked user before shareholder/admin logic ever runs", async () => {
    vi.mocked(auth).mockResolvedValue(session({ status: "blocked", isAccountingAdmin: true }));
    await expect(requireShareholder()).rejects.toThrow();
    vi.mocked(auth).mockResolvedValue(session({ status: "blocked", isAccountingAdmin: true }));
    await expect(requireAdmin()).rejects.toThrow();
  });

  it("redirects a pending (not yet approved) user", async () => {
    vi.mocked(auth).mockResolvedValue(session({ status: "pending", isAccountingAdmin: true }));
    await expect(requireAuthorized()).rejects.toThrow();
  });
});
