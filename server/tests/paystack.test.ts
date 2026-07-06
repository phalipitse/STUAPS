import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

const ORIGINAL_ENV = { ...process.env };

describe("paystack helpers", () => {
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc123";
    process.env.PAYSTACK_PLAN_CODE_MONTHLY = "PLN_monthly";
    process.env.PAYSTACK_PLAN_CODE_ANNUAL = "PLN_annual";
    process.env.PAYSTACK_PLAN_CODE_ADDON_MONTHLY = "PLN_addon_monthly";
    process.env.PAYSTACK_PLAN_CODE_ADDON_ANNUAL_EXTRA = "PLN_addon_annual";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("resolves plan codes from env vars per billing plan", async () => {
    const { getPlanCode, getAddonPlanCode } = await import("../src/lib/paystack.js");
    expect(getPlanCode("monthly")).toBe("PLN_monthly");
    expect(getPlanCode("annual")).toBe("PLN_annual");
    expect(getAddonPlanCode("monthly")).toBe("PLN_addon_monthly");
    expect(getAddonPlanCode("annual")).toBe("PLN_addon_annual");
  });

  it("throws a clear error when a plan code env var is missing", async () => {
    delete process.env.PAYSTACK_PLAN_CODE_ANNUAL;
    const { getPlanCode } = await import("../src/lib/paystack.js");
    expect(() => getPlanCode("annual")).toThrow("PAYSTACK_PLAN_CODE_ANNUAL");
  });

  it("infers base vs addon kind from a renewal's plan code", async () => {
    const { inferKindFromPlanCode } = await import("../src/lib/paystack.js");
    expect(inferKindFromPlanCode("PLN_monthly")).toBe("base");
    expect(inferKindFromPlanCode("PLN_annual")).toBe("base");
    expect(inferKindFromPlanCode("PLN_addon_monthly")).toBe("addon");
    expect(inferKindFromPlanCode("PLN_addon_annual")).toBe("addon");
    expect(inferKindFromPlanCode("PLN_unknown")).toBeNull();
    expect(inferKindFromPlanCode(null)).toBeNull();
  });

  it("verifies a correctly-signed webhook body", async () => {
    const { verifyWebhookSignature } = await import("../src/lib/paystack.js");
    const body = Buffer.from(JSON.stringify({ event: "charge.success", data: {} }));
    const signature = createHmac("sha512", "sk_test_abc123").update(body).digest("hex");
    expect(verifyWebhookSignature(body, signature)).toBe(true);
  });

  it("rejects a tampered webhook body or wrong signature", async () => {
    const { verifyWebhookSignature } = await import("../src/lib/paystack.js");
    const body = Buffer.from(JSON.stringify({ event: "charge.success", data: {} }));
    const signature = createHmac("sha512", "sk_test_abc123").update(body).digest("hex");
    const tamperedBody = Buffer.from(JSON.stringify({ event: "charge.success", data: { amount: 1 } }));
    expect(verifyWebhookSignature(tamperedBody, signature)).toBe(false);
    expect(verifyWebhookSignature(body, "not-a-real-signature")).toBe(false);
    expect(verifyWebhookSignature(body, undefined)).toBe(false);
  });
});
