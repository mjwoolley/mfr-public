import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { render } from "@react-email/render";
import { ContributionNotification } from "./ContributionNotification";
import { AdjustmentNotification } from "./AdjustmentNotification";
import { TransferNotification } from "./TransferNotification";
import { CorrectionNotification } from "./CorrectionNotification";

describe("accounting email templates", () => {
  it("ContributionNotification shows name, amount, date, admin, inbox link", async () => {
    const html = await render(
      createElement(ContributionNotification, {
        shareholderName: "Dana Brown",
        amount: "$500.00",
        date: "July 1, 2026",
        adminName: "Mike Admin",
        inboxUrl: "https://acct.example/inbox",
      }),
    );
    expect(html).toContain("Dana Brown");
    expect(html).toContain("$500.00");
    expect(html).toContain("July 1, 2026");
    expect(html).toContain("Mike Admin");
    expect(html).toContain("https://acct.example/inbox");
  });

  it("AdjustmentNotification shows amount, reason, inbox link", async () => {
    const html = await render(
      createElement(AdjustmentNotification, {
        shareholderName: "Dana Brown",
        amount: "12.50",
        description: "correcting a rounding error",
        date: "July 1, 2026",
        adminName: "Mike Admin",
        inboxUrl: "https://acct.example/inbox",
      }),
    );
    expect(html).toContain("Dana Brown");
    expect(html).toContain("12.50");
    expect(html).toContain("correcting a rounding error");
    expect(html).toContain("https://acct.example/inbox");
  });

  it("TransferNotification shows 'sent' direction wording", async () => {
    const html = await render(
      createElement(TransferNotification, {
        recipientName: "Dana Brown",
        direction: "sent",
        counterpartyName: "Sam Lee",
        amount: "42.00",
        description: "a gift of shares",
        date: "July 1, 2026",
        adminName: "Mike Admin",
        inboxUrl: "https://acct.example/inbox",
      }),
    );
    expect(html).toContain("from you to Sam Lee");
    expect(html).toContain("42.00");
    expect(html).toContain("a gift of shares");
  });

  it("TransferNotification shows 'received' direction wording", async () => {
    const html = await render(
      createElement(TransferNotification, {
        recipientName: "Sam Lee",
        direction: "received",
        counterpartyName: "Dana Brown",
        amount: "42.00",
        description: "a gift of shares",
        date: "July 1, 2026",
        adminName: "Mike Admin",
        inboxUrl: "https://acct.example/inbox",
      }),
    );
    expect(html).toContain("from Dana Brown to you");
  });

  it("CorrectionNotification shows the corrected original type and reason", async () => {
    const html = await render(
      createElement(CorrectionNotification, {
        shareholderName: "Dana Brown",
        amount: "7.00",
        description: "entered the wrong amount",
        originalType: "CONTRIBUTION",
        date: "July 1, 2026",
        adminName: "Mike Admin",
        inboxUrl: "https://acct.example/inbox",
      }),
    );
    expect(html).toContain("Dana Brown");
    expect(html).toContain("entered the wrong amount");
    expect(html).toContain("contribution");
  });
});
