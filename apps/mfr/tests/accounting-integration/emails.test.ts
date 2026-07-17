import { describe, it, expect, afterEach, vi } from "vitest";
import { render } from "@react-email/render";
import { testDb } from "./testDb";

// Same auth/next-cache seams as shareholders.test.ts.
vi.mock("@/lib/accounting/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Mock the email boundary so we assert on how the actions call sendEmail,
// without hitting SES. appUrl is stubbed to identity so inbox links are "/inbox".
vi.mock("@/lib/accounting/email", () => ({ sendEmail: vi.fn(), appUrl: (p: string) => p }));

import { auth } from "@/lib/accounting/auth";
import { sendEmail } from "@/lib/accounting/email";
import { formatUSD } from "@/lib/accounting/format";
import { createContribution } from "@/actions/accounting/contributions";
import { createTransfer } from "@/actions/accounting/transfers";
import { createAdjustment } from "@/actions/accounting/adjustments";
import { createCorrection } from "@/actions/accounting/corrections";

const ADMIN_SESSION = {
  user: {
    id: "admin-1",
    status: "approved",
    roles: { siteOwner: false, siteManager: false, accountingManager: true },
    shareholderId: null,
    email: "admin@example.com",
    name: "Ada Admin",
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
const createdTransactionIds: string[] = [];

async function makeShareholder(withEmail: boolean, label: string) {
  const tag = `${label}-${Date.now()}-${Math.random()}`;
  const sh = await testDb.shareholder.create({
    data: {
      name: `${label} ${tag}`,
      email: withEmail ? `${tag}@example.com` : null,
      active: true,
    },
  });
  createdShareholderIds.push(sh.id);
  return sh;
}

async function trackTxFor(shareholderId: string) {
  const entries = await testDb.ledgerEntry.findMany({ where: { shareholderId } });
  for (const e of entries) createdTransactionIds.push(e.transactionId);
}

function calls() {
  return vi.mocked(sendEmail).mock.calls.map((c) => c[0]);
}

afterEach(async () => {
  vi.mocked(auth).mockReset();
  vi.mocked(sendEmail).mockReset();
  // Corrections reference the original via correctsTransactionId; unshift keeps
  // corrections ahead of their originals so deletes don't hit that FK.
  for (const id of createdTransactionIds) {
    await testDb.transaction.delete({ where: { id } }).catch(() => {});
  }
  createdTransactionIds.length = 0;
  for (const id of createdShareholderIds) {
    await testDb.shareholder.delete({ where: { id } }).catch(() => {});
  }
  createdShareholderIds.length = 0;
});

describe("createContribution notification", () => {
  it("emails the shareholder with the amount, admin reply-to, and wired template props", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    const sh = await makeShareholder(true, "contrib");

    const res = await createContribution(undefined, fd({ shareholderId: sh.id, amount: "100" }));
    expect(res?.success).toBe(true);
    await trackTxFor(sh.id);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const call = calls()[0];
    expect(call.to).toBe(sh.email);
    expect(call.subject).toContain(formatUSD(100));
    expect(call.replyTo).toBe("admin@example.com");

    const html = await render(call.react);
    expect(html).toContain(sh.name);
    expect(html).toContain("Ada Admin");
    expect(html).toContain("/inbox");
  });

  it("does not email a shareholder with no address", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    const sh = await makeShareholder(false, "contrib-noemail");

    const res = await createContribution(undefined, fd({ shareholderId: sh.id, amount: "50" }));
    expect(res?.success).toBe(true);
    await trackTxFor(sh.id);

    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("createTransfer notifications", () => {
  it("emails both parties with direction-appropriate counterparties", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    const from = await makeShareholder(true, "from");
    const to = await makeShareholder(true, "to");

    const res = await createTransfer(
      undefined,
      fd({
        fromShareholderId: from.id,
        toShareholderId: to.id,
        amount: "10",
        description: "a gift",
      }),
    );
    expect(res?.success).toBe(true);
    await trackTxFor(from.id);

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const sent = calls().find((c) => c.to === from.email)!;
    const received = calls().find((c) => c.to === to.email)!;
    expect(sent.subject).toContain(to.name);
    expect(received.subject).toContain(from.name);
    expect(sent.replyTo).toBe("admin@example.com");
  });

  it("emails only the party that has an address", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    const from = await makeShareholder(true, "mfrom");
    const to = await makeShareholder(false, "mto");

    const res = await createTransfer(
      undefined,
      fd({
        fromShareholderId: from.id,
        toShareholderId: to.id,
        amount: "5",
        description: "half gift",
      }),
    );
    expect(res?.success).toBe(true);
    await trackTxFor(from.id);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(calls()[0].to).toBe(from.email);
  });
});

describe("createAdjustment notification", () => {
  it("emails the shareholder with the reason and amount", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    const sh = await makeShareholder(true, "adj");

    const res = await createAdjustment(
      undefined,
      fd({ shareholderId: sh.id, amount: "25", description: "rounding fix" }),
    );
    expect(res?.success).toBe(true);
    await trackTxFor(sh.id);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const call = calls()[0];
    expect(call.to).toBe(sh.email);
    expect(call.subject).toContain(formatUSD(25));
    const html = await render(call.react);
    expect(html).toContain("rounding fix");
  });

  it("does not email a shareholder with no address", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    const sh = await makeShareholder(false, "adj-noemail");

    const res = await createAdjustment(
      undefined,
      fd({ shareholderId: sh.id, amount: "25", description: "rounding fix" }),
    );
    expect(res?.success).toBe(true);
    await trackTxFor(sh.id);

    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("createCorrection notifications", () => {
  it("emails each corrected entry that has an address, skipping those without", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    const withEmail = await makeShareholder(true, "corr-with");
    const noEmail = await makeShareholder(false, "corr-without");

    // Seed a two-party original transaction to correct.
    const original = await testDb.transaction.create({
      data: {
        type: "TRANSFER",
        description: "original transfer",
        createdById: "admin-1",
        entries: {
          create: [
            { shareholderId: withEmail.id, shares: -100 },
            { shareholderId: noEmail.id, shares: 100 },
          ],
        },
        approvals: {
          create: [{ shareholderId: withEmail.id }, { shareholderId: noEmail.id }],
        },
      },
    });
    createdTransactionIds.push(original.id);

    const res = await createCorrection(
      undefined,
      fd({
        originalTransactionId: original.id,
        description: "wrong amount",
        [`amount_${withEmail.id}`]: "-90",
        [`amount_${noEmail.id}`]: "90",
      }),
    );
    expect(res?.success).toBe(true);
    const correction = await testDb.transaction.findFirst({
      where: { correctsTransactionId: original.id },
    });
    createdTransactionIds.unshift(correction!.id);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const call = calls()[0];
    expect(call.to).toBe(withEmail.email);
    expect(call.subject).toContain("Correction");
  });
});

describe("validation failures never send", () => {
  it("createAdjustment with a zero amount returns an error and sends nothing", async () => {
    vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
    const sh = await makeShareholder(true, "adj-zero");

    const res = await createAdjustment(
      undefined,
      fd({ shareholderId: sh.id, amount: "0", description: "noop" }),
    );
    expect(res?.error).toBeTruthy();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
