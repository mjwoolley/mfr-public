import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";

const sendMock = vi.fn();
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = sendMock;
  },
  SendEmailCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

import { appUrl, plusAddress, resolveRecipient, sendEmail } from "./email";

const react = createElement("p", null, "hello");

function sentInput() {
  return (sendMock.mock.calls[0][0] as { input: Record<string, never> }).input;
}

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("plusAddress", () => {
  it("folds the full original address into a plus sub-address of the inbox", () => {
    expect(plusAddress("mwoolley2@gmail.com", "dbrown@gmail.com")).toBe(
      "mwoolley2+dbrown=gmail.com@gmail.com",
    );
  });

  it("sanitizes characters that would break the local part", () => {
    expect(plusAddress("me@gmail.com", "First Last+x@corp.io")).toBe(
      "me+first-last-x=corp.io@gmail.com",
    );
  });

  it("drops an existing +tag on the inbox before adding its own", () => {
    expect(plusAddress("me+ignored@gmail.com", "a@b.com")).toBe("me+a=b.com@gmail.com");
  });
});

describe("resolveRecipient", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_ENABLED", "");
    vi.stubEnv("EMAIL_OVERRIDE_TO", "");
  });

  it("delivers to the real recipient only when EMAIL_ENABLED=true", () => {
    vi.stubEnv("EMAIL_ENABLED", "true");
    expect(resolveRecipient("member@example.com")).toEqual({
      deliver: true,
      to: "member@example.com",
    });
  });

  it("redirects to a plus sub-address of the override inbox when not enabled", () => {
    vi.stubEnv("EMAIL_OVERRIDE_TO", "test@example.com");
    expect(resolveRecipient("member@example.com")).toEqual({
      deliver: true,
      to: "test+member=example.com@example.com",
      redirectedFrom: "member@example.com",
    });
  });

  it("does not deliver when neither enabled nor overridden", () => {
    expect(resolveRecipient("member@example.com").deliver).toBe(false);
  });

  it("override does not take precedence over an explicit prod enable", () => {
    vi.stubEnv("EMAIL_ENABLED", "true");
    vi.stubEnv("EMAIL_OVERRIDE_TO", "test@example.com");
    expect(resolveRecipient("member@example.com")).toEqual({
      deliver: true,
      to: "member@example.com",
    });
  });
});

describe("appUrl", () => {
  it("defaults to localhost when APP_BASE_URL is unset", () => {
    vi.stubEnv("APP_BASE_URL", undefined);
    expect(appUrl("/inbox")).toBe("http://localhost:3000/inbox");
  });

  it("preserves the base path segment and strips a trailing slash", () => {
    vi.stubEnv("APP_BASE_URL", "https://example.org/accounting/");
    expect(appUrl("/inbox")).toBe("https://example.org/accounting/inbox");
  });

  it("adds a leading slash when the path lacks one", () => {
    vi.stubEnv("APP_BASE_URL", "https://example.org/accounting");
    expect(appUrl("inbox")).toBe("https://example.org/accounting/inbox");
  });
});

describe("sendEmail (SES transport)", () => {
  beforeEach(() => {
    // Exercise the real-delivery path unless a test overrides it.
    vi.stubEnv("EMAIL_ENABLED", "true");
  });

  it("sends from EMAIL_FROM with to/replyTo and rendered HTML", async () => {
    vi.stubEnv("EMAIL_FROM", "accounting@millerfamilyreunions.org");
    await sendEmail({
      to: "owner@example.com",
      subject: "Test subject",
      react,
      replyTo: "actor@example.com",
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const input = sentInput();
    expect(input).toMatchObject({
      FromEmailAddress: "accounting@millerfamilyreunions.org",
      Destination: { ToAddresses: ["owner@example.com"] },
      ReplyToAddresses: ["actor@example.com"],
    });
    const content = input.Content as {
      Simple: { Subject: { Data: string }; Body: { Html: { Data: string } } };
    };
    expect(content.Simple.Subject.Data).toBe("Test subject");
    expect(content.Simple.Body.Html.Data).toContain("hello");
  });

  it("omits replyTo when not provided", async () => {
    await sendEmail({ to: "owner@example.com", subject: "Test", react });
    const input = sentInput() as { ReplyToAddresses?: unknown };
    expect(input.ReplyToAddresses).toBeUndefined();
  });

  it("logs and does not throw when the SES send fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMock.mockRejectedValue(new Error("credentials missing"));
    await expect(
      sendEmail({ to: "owner@example.com", subject: "Test", react }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
  });

  it("routes through the guard: redirects to the override inbox when not enabled", async () => {
    vi.stubEnv("EMAIL_ENABLED", "");
    vi.stubEnv("EMAIL_OVERRIDE_TO", "test@example.com");
    await sendEmail({ to: "dbrown@gmail.com", subject: "Hi", react });
    const input = sentInput() as unknown as {
      Destination: { ToAddresses: string[] };
      Content: { Simple: { Subject: { Data: string } } };
    };
    expect(input.Destination.ToAddresses).toEqual(["test+dbrown=gmail.com@example.com"]);
    expect(input.Content.Simple.Subject.Data).toBe("[dev→dbrown@gmail.com] Hi");
  });

  it("does not call SES at all when disabled with no override", async () => {
    vi.stubEnv("EMAIL_ENABLED", "");
    vi.stubEnv("EMAIL_OVERRIDE_TO", "");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await sendEmail({ to: "dbrown@gmail.com", subject: "Hi", react });
    expect(sendMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
