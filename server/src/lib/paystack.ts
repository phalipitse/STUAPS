import { createHmac, timingSafeEqual } from "node:crypto";

const PAYSTACK_API_BASE = "https://api.paystack.co";

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }
  return key;
}

export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

async function paystackRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${PAYSTACK_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as PaystackEnvelope<T>;
  if (!res.ok || json.status === false) {
    throw new Error(`Paystack ${method} ${path} failed: ${json.message ?? res.status}`);
  }
  return json.data;
}

export type BillingPlan = "monthly" | "annual";

export function getPlanCode(plan: BillingPlan): string {
  const envVar = plan === "annual" ? "PAYSTACK_PLAN_CODE_ANNUAL" : "PAYSTACK_PLAN_CODE_MONTHLY";
  const code = process.env[envVar];
  if (!code) throw new Error(`${envVar} is not configured`);
  return code;
}

export function getAddonPlanCode(basePlan: BillingPlan): string {
  const envVar =
    basePlan === "annual" ? "PAYSTACK_PLAN_CODE_ADDON_ANNUAL_EXTRA" : "PAYSTACK_PLAN_CODE_ADDON_MONTHLY";
  const code = process.env[envVar];
  if (!code) throw new Error(`${envVar} is not configured`);
  return code;
}

/** Rand amounts — must match what each Plan is configured for in the Paystack dashboard. */
export const PLAN_AMOUNTS_ZAR: Record<BillingPlan, number> = {
  monthly: 750,
  annual: 8100,
};
export const ADDON_AMOUNTS_ZAR: Record<BillingPlan, number> = {
  monthly: 200,
  annual: 150,
};

/** planCode -> which of our two subscription "kinds" it belongs to, for renewal webhooks that carry no metadata. */
export function inferKindFromPlanCode(planCode: string | undefined | null): "base" | "addon" | null {
  if (!planCode) return null;
  if (planCode === process.env.PAYSTACK_PLAN_CODE_MONTHLY || planCode === process.env.PAYSTACK_PLAN_CODE_ANNUAL) {
    return "base";
  }
  if (
    planCode === process.env.PAYSTACK_PLAN_CODE_ADDON_MONTHLY ||
    planCode === process.env.PAYSTACK_PLAN_CODE_ADDON_ANNUAL_EXTRA
  ) {
    return "addon";
  }
  return null;
}

interface InitializeTransactionResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

/** Starts (or resumes) a plan-linked Paystack transaction — the Standard Checkout redirect flow. */
export async function initializeTransaction(params: {
  email: string;
  amountRand: number;
  planCode: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}): Promise<InitializeTransactionResult> {
  return paystackRequest<InitializeTransactionResult>("POST", "/transaction/initialize", {
    email: params.email,
    amount: Math.round(params.amountRand * 100),
    currency: "ZAR",
    plan: params.planCode,
    callback_url: params.callbackUrl,
    metadata: params.metadata,
  });
}

interface VerifyTransactionResult {
  status: "success" | "failed" | "abandoned" | string;
  reference: string;
  metadata: Record<string, string> | null;
  customer: { customer_code: string };
}

export async function verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
  return paystackRequest<VerifyTransactionResult>(
    "GET",
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
}

interface PaystackSubscription {
  subscription_code: string;
  plan: { plan_code: string };
  status: string;
}

export async function listCustomerSubscriptions(customerCode: string): Promise<PaystackSubscription[]> {
  return paystackRequest<PaystackSubscription[]>("GET", `/subscription?customer=${customerCode}`);
}

/** Paystack's closest equivalent to a Stripe billing-portal link — lets the customer update their card or cancel. */
export async function getSubscriptionManageLink(subscriptionCode: string): Promise<string> {
  const data = await paystackRequest<{ link: string }>(
    "GET",
    `/subscription/${subscriptionCode}/manage/link`
  );
  return data.link;
}

/** Verifies the `x-paystack-signature` header (HMAC-SHA512 of the raw body) against our secret key. */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", getSecretKey()).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
