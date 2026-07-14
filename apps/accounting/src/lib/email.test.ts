import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveRecipient } from "./email";

describe("resolveRecipient", () => {
  const original = {
    EMAIL_ENABLED: process.env.EMAIL_ENABLED,
    EMAIL_OVERRIDE_TO: process.env.EMAIL_OVERRIDE_TO,
  };

  beforeEach(() => {
    delete process.env.EMAIL_ENABLED;
    delete process.env.EMAIL_OVERRIDE_TO;
  });

  afterEach(() => {
    process.env.EMAIL_ENABLED = original.EMAIL_ENABLED;
    process.env.EMAIL_OVERRIDE_TO = original.EMAIL_OVERRIDE_TO;
  });

  it("delivers to the real recipient only when EMAIL_ENABLED=true", () => {
    process.env.EMAIL_ENABLED = "true";
    expect(resolveRecipient("member@example.com")).toEqual({
      deliver: true,
      to: "member@example.com",
    });
  });

  it("redirects to the override inbox when sending is not enabled", () => {
    process.env.EMAIL_OVERRIDE_TO = "test@example.com";
    expect(resolveRecipient("member@example.com")).toEqual({
      deliver: true,
      to: "test@example.com",
      redirectedFrom: "member@example.com",
    });
  });

  it("does not deliver when neither enabled nor overridden", () => {
    const result = resolveRecipient("member@example.com");
    expect(result.deliver).toBe(false);
  });

  it("override does not take precedence over an explicit prod enable", () => {
    process.env.EMAIL_ENABLED = "true";
    process.env.EMAIL_OVERRIDE_TO = "test@example.com";
    expect(resolveRecipient("member@example.com")).toEqual({
      deliver: true,
      to: "member@example.com",
    });
  });
});
