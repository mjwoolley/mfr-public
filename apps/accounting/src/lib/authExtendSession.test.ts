// The extendSession hook in @/lib/auth — accounting's one app-specific
// session field (the linked Shareholder id) plus the once-only email link
// and its P2002 race handling. The module wires NextAuth at load time, so
// next-auth and the DB singletons are mocked and the hook is captured from
// the createAuthConfig options.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { Prisma } from "@/generated/prisma/client";

const captured: { extendSession?: (session: Session, user: unknown) => Promise<void> } = {};

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  })),
}));

vi.mock("@mfr/auth", () => ({
  createAuthConfig: vi.fn((opts: { extendSession: typeof captured.extendSession }) => {
    captured.extendSession = opts.extendSession;
    return {};
  }),
  createRolesReaderFromEnv: vi.fn(() => async () => ({
    siteOwner: false,
    siteManager: false,
    accountingManager: false,
  })),
}));

vi.mock("@/lib/identityDb", () => ({ identityDb: {} }));

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shareholder: {
      get findUnique() {
        return findUnique;
      },
      get update() {
        return update;
      },
    },
  },
}));

// Importing the module under test runs NextAuth(createAuthConfig(...)) with
// the mocks above and fills `captured`.
await import("@/lib/auth");

function session(): Session {
  return { user: {} } as Session;
}

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError("unique", {
    code: "P2002",
    clientVersion: "test",
  });

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
});

describe("extendSession", () => {
  it("was captured from the shared config factory", () => {
    expect(captured.extendSession).toBeTypeOf("function");
  });

  it("attaches null when the user has no email", async () => {
    const s = session();
    await captured.extendSession!(s, { id: "u1", email: null });

    expect(s.user.shareholderId).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("attaches null when no shareholder matches the email", async () => {
    findUnique.mockResolvedValue(null);
    const s = session();
    await captured.extendSession!(s, { id: "u1", email: "nobody@example.com" });

    expect(s.user.shareholderId).toBeNull();
  });

  it("lowercases the email for the lookup", async () => {
    findUnique.mockResolvedValue(null);
    await captured.extendSession!(session(), { id: "u1", email: "Mixed@Example.COM" });

    expect(findUnique).toHaveBeenCalledWith({ where: { email: "mixed@example.com" } });
  });

  it("attaches the id without relinking when the shareholder is already linked to this user", async () => {
    findUnique.mockResolvedValue({ id: "sh1", userId: "u1" });
    const s = session();
    await captured.extendSession!(s, { id: "u1", email: "a@b.c" });

    expect(s.user.shareholderId).toBe("sh1");
    expect(update).not.toHaveBeenCalled();
  });

  it("links the shareholder to this user on first sign-in", async () => {
    findUnique.mockResolvedValue({ id: "sh1", userId: null });
    update.mockResolvedValue({});
    const s = session();
    await captured.extendSession!(s, { id: "u1", email: "a@b.c" });

    expect(update).toHaveBeenCalledWith({ where: { id: "sh1" }, data: { userId: "u1" } });
    expect(s.user.shareholderId).toBe("sh1");
  });

  it("swallows a lost P2002 relink race and still attaches the id", async () => {
    findUnique.mockResolvedValue({ id: "sh1", userId: "other-user" });
    update.mockRejectedValue(p2002());
    const s = session();

    await captured.extendSession!(s, { id: "u1", email: "a@b.c" });
    expect(s.user.shareholderId).toBe("sh1");
  });

  it("rethrows non-P2002 errors from the relink", async () => {
    findUnique.mockResolvedValue({ id: "sh1", userId: "other-user" });
    update.mockRejectedValue(new Error("connection lost"));

    await expect(captured.extendSession!(session(), { id: "u1", email: "a@b.c" })).rejects.toThrow(
      "connection lost",
    );
  });
});
