import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { plusAddress, resolveRecipient } from "./email";

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
    expect(plusAddress("me+ignored@gmail.com", "a@b.com")).toBe(
      "me+a=b.com@gmail.com",
    );
  });
});

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

  it("redirects to a plus sub-address of the override inbox when not enabled", () => {
    process.env.EMAIL_OVERRIDE_TO = "test@example.com";
    expect(resolveRecipient("member@example.com")).toEqual({
      deliver: true,
      to: "test+member=example.com@example.com",
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
