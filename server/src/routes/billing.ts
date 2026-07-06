import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { tenants } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  isPaystackConfigured,
  getPlanCode,
  getAddonPlanCode,
  initializeTransaction,
  verifyTransaction,
  listCustomerSubscriptions,
  getSubscriptionManageLink,
  verifyWebhookSignature,
  inferKindFromPlanCode,
  PLAN_AMOUNTS_ZAR,
  ADDON_AMOUNTS_ZAR,
} from "../lib/paystack.js";
import type { BillingPlan } from "../lib/paystack.js";

export const billingRouter = Router();

function originOf(req: { protocol: string; get: (h: string) => string | undefined }) {
  return `${req.protocol}://${req.get("host")}`;
}

const checkoutSchema = z.object({
  plan: z.enum(["monthly", "annual"]).default("monthly"),
});

/** Starts (or resumes) a Paystack Standard Checkout transaction for the caller's tenant. */
billingRouter.post("/checkout", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    if (!isPaystackConfigured()) {
      return res.status(400).json({ error: "Billing is not configured on this server yet" });
    }
    const parsed = checkoutSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.session.tenantId!));
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const result = await initializeTransaction({
      email: tenant.contactEmail,
      amountRand: PLAN_AMOUNTS_ZAR[parsed.data.plan],
      planCode: getPlanCode(parsed.data.plan),
      callbackUrl: `${originOf(req)}/billing`,
      metadata: { tenantId: String(tenant.id), plan: parsed.data.plan, kind: "base" },
    });

    res.json({ url: result.authorization_url });
  } catch (err) {
    next(err);
  }
});

/**
 * Starts a checkout transaction for the Premium add-on (financial statements +
 * payroll) — a second, independent subscription on the same Paystack customer,
 * priced off whichever base plan interval the tenant is already on.
 */
billingRouter.post("/addon/checkout", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    if (!isPaystackConfigured()) {
      return res.status(400).json({ error: "Billing is not configured on this server yet" });
    }
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.session.tenantId!));
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    const basePlan: BillingPlan = tenant.billingPlan === "annual" ? "annual" : "monthly";

    const result = await initializeTransaction({
      email: tenant.contactEmail,
      amountRand: ADDON_AMOUNTS_ZAR[basePlan],
      planCode: getAddonPlanCode(basePlan),
      callbackUrl: `${originOf(req)}/billing`,
      metadata: { tenantId: String(tenant.id), kind: "addon" },
    });

    res.json({ url: result.authorization_url });
  } catch (err) {
    next(err);
  }
});

/**
 * Confirms a just-completed checkout synchronously — Paystack's redirect back
 * to us doesn't reliably distinguish success/failure/abandonment on its own,
 * so the frontend calls this with the `reference` query param Paystack appends
 * to the callback URL, rather than guessing from the redirect alone.
 */
billingRouter.get("/verify", requireAuth, async (req, res, next) => {
  try {
    const reference = typeof req.query.reference === "string" ? req.query.reference : "";
    if (!reference) return res.status(400).json({ error: "reference is required" });
    const result = await verifyTransaction(reference);
    res.json({ status: result.status, kind: result.metadata?.kind ?? null });
  } catch (err) {
    next(err);
  }
});

/** Paystack's closest equivalent to a hosted billing portal — a link to update the card or cancel. */
billingRouter.get("/portal", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.session.tenantId!));
    if (!tenant?.paystackSubscriptionCode) {
      return res.status(400).json({ error: "No billing account yet — start a checkout first" });
    }
    const link = await getSubscriptionManageLink(tenant.paystackSubscriptionCode);
    res.json({ url: link });
  } catch (err) {
    next(err);
  }
});

/** Best-effort lookup of a just-activated subscription's code, so /portal and future webhooks can reference it directly. */
async function linkSubscriptionCode(tenantId: number, customerCode: string, kind: "base" | "addon") {
  try {
    const subs = await listCustomerSubscriptions(customerCode);
    const wantedCodes = (
      kind === "addon"
        ? [process.env.PAYSTACK_PLAN_CODE_ADDON_MONTHLY, process.env.PAYSTACK_PLAN_CODE_ADDON_ANNUAL_EXTRA]
        : [process.env.PAYSTACK_PLAN_CODE_MONTHLY, process.env.PAYSTACK_PLAN_CODE_ANNUAL]
    ).filter(Boolean);
    const match = subs.find((s) => wantedCodes.includes(s.plan?.plan_code));
    if (!match) return;
    await db
      .update(tenants)
      .set(
        kind === "addon"
          ? { addonPaystackSubscriptionCode: match.subscription_code }
          : { paystackSubscriptionCode: match.subscription_code }
      )
      .where(eq(tenants.id, tenantId));
  } catch (err) {
    console.error("Could not look up Paystack subscription code:", err);
  }
}

interface PaystackChargeSuccessData {
  metadata?: { tenantId?: string; plan?: string; kind?: string } | null;
  customer?: { customer_code?: string } | null;
  plan?: string | null;
  plan_object?: { plan_code?: string } | null;
}

async function handleChargeSuccess(data: PaystackChargeSuccessData) {
  const metadataTenantId = Number(data.metadata?.tenantId);
  const customerCode = data.customer?.customer_code;
  const planCode = data.plan || data.plan_object?.plan_code || null;

  let tenant;
  if (Number.isFinite(metadataTenantId) && metadataTenantId > 0) {
    [tenant] = await db.select().from(tenants).where(eq(tenants.id, metadataTenantId));
  } else if (customerCode) {
    [tenant] = await db.select().from(tenants).where(eq(tenants.paystackCustomerCode, customerCode));
  }
  if (!tenant) return; // not one of ours, or a renewal we can't correlate yet

  const kind = data.metadata?.kind ?? inferKindFromPlanCode(planCode);
  if (!kind) return;

  if (kind === "addon") {
    await db
      .update(tenants)
      .set({
        addonStatus: "active",
        ...(customerCode && !tenant.paystackCustomerCode ? { paystackCustomerCode: customerCode } : {}),
      })
      .where(eq(tenants.id, tenant.id));
    if (customerCode && !tenant.addonPaystackSubscriptionCode) {
      await linkSubscriptionCode(tenant.id, customerCode, "addon");
    }
  } else {
    await db
      .update(tenants)
      .set({
        subscriptionStatus: "active",
        ...(customerCode && !tenant.paystackCustomerCode ? { paystackCustomerCode: customerCode } : {}),
        ...(data.metadata?.plan ? { billingPlan: data.metadata.plan } : {}),
      })
      .where(eq(tenants.id, tenant.id));
    if (customerCode && !tenant.paystackSubscriptionCode) {
      await linkSubscriptionCode(tenant.id, customerCode, "base");
    }
  }
}

async function findTenantBySubscriptionCode(subscriptionCode: string) {
  const [baseMatch] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.paystackSubscriptionCode, subscriptionCode));
  if (baseMatch) return { tenant: baseMatch, kind: "base" as const };

  const [addonMatch] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.addonPaystackSubscriptionCode, subscriptionCode));
  if (addonMatch) return { tenant: addonMatch, kind: "addon" as const };

  return null;
}

async function handleSubscriptionDisable(data: { subscription_code?: string }) {
  if (!data.subscription_code) return;
  const found = await findTenantBySubscriptionCode(data.subscription_code);
  if (!found) return;
  await db
    .update(tenants)
    .set(found.kind === "addon" ? { addonStatus: "cancelled" } : { subscriptionStatus: "cancelled" })
    .where(eq(tenants.id, found.tenant.id));
}

async function handleInvoicePaymentFailed(data: {
  subscription?: { subscription_code?: string } | null;
  subscription_code?: string;
}) {
  const subscriptionCode = data.subscription?.subscription_code ?? data.subscription_code;
  if (!subscriptionCode) return;
  const found = await findTenantBySubscriptionCode(subscriptionCode);
  if (!found) return;
  await db
    .update(tenants)
    .set(found.kind === "addon" ? { addonStatus: "past_due" } : { subscriptionStatus: "past_due" })
    .where(eq(tenants.id, found.tenant.id));
}

/**
 * Paystack webhook handler — deliberately NOT registered on billingRouter.
 * app.ts mounts this directly at /api/billing/webhook with express.raw()
 * BEFORE the global express.json() middleware, since signature verification
 * needs the exact raw request bytes, not a parsed JSON object.
 */
export async function paystackWebhookHandler(req: Request, res: Response) {
  const signature = req.headers["x-paystack-signature"];
  if (typeof signature !== "string" || !verifyWebhookSignature(req.body as Buffer, signature)) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  let event: { event: string; data: Record<string, unknown> };
  try {
    event = JSON.parse((req.body as Buffer).toString("utf-8"));
  } catch {
    return res.status(400).json({ error: "Malformed payload" });
  }

  try {
    switch (event.event) {
      case "charge.success":
        await handleChargeSuccess(event.data as PaystackChargeSuccessData);
        break;
      case "subscription.disable":
        await handleSubscriptionDisable(event.data as { subscription_code?: string });
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(
          event.data as { subscription?: { subscription_code?: string }; subscription_code?: string }
        );
        break;
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error("Paystack webhook handler error:", err);
    res.status(500).json({ error: "Webhook handler failed" });
  }
}
