import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { tenants } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { getStripeClient, getStripePriceId, getAddonPriceId, mapStripeStatus } from "../lib/stripe.js";
import type { BillingPlan } from "../lib/stripe.js";

export const billingRouter = Router();

function originOf(req: { protocol: string; get: (h: string) => string | undefined }) {
  return `${req.protocol}://${req.get("host")}`;
}

const checkoutSchema = z.object({
  plan: z.enum(["monthly", "annual"]).default("monthly"),
});

/** Starts (or resumes) a Stripe Checkout session for the caller's tenant. */
billingRouter.post("/checkout", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = checkoutSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const stripe = getStripeClient();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.session.tenantId!));
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: tenant.contactEmail,
        name: tenant.companyName,
        metadata: { tenantId: String(tenant.id) },
      });
      customerId = customer.id;
      await db.update(tenants).set({ stripeCustomerId: customerId }).where(eq(tenants.id, tenant.id));
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: getStripePriceId(parsed.data.plan), quantity: 1 }],
      success_url: `${originOf(req)}/billing?checkout=success`,
      cancel_url: `${originOf(req)}/billing?checkout=cancelled`,
      metadata: { tenantId: String(tenant.id), plan: parsed.data.plan, kind: "base" },
      subscription_data: {
        metadata: { tenantId: String(tenant.id), plan: parsed.data.plan, kind: "base" },
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

/**
 * Starts a Checkout Session for the Premium add-on (financial statements +
 * payroll) — a second, independent subscription on the same Stripe customer,
 * priced off whichever base plan interval the tenant is already on.
 */
billingRouter.post("/addon/checkout", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const stripe = getStripeClient();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.session.tenantId!));
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: tenant.contactEmail,
        name: tenant.companyName,
        metadata: { tenantId: String(tenant.id) },
      });
      customerId = customer.id;
      await db.update(tenants).set({ stripeCustomerId: customerId }).where(eq(tenants.id, tenant.id));
    }

    const basePlan: BillingPlan = tenant.billingPlan === "annual" ? "annual" : "monthly";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: getAddonPriceId(basePlan), quantity: 1 }],
      success_url: `${originOf(req)}/billing?addon=success`,
      cancel_url: `${originOf(req)}/billing?addon=cancelled`,
      metadata: { tenantId: String(tenant.id), kind: "addon" },
      subscription_data: { metadata: { tenantId: String(tenant.id), kind: "addon" } },
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

/** Opens the Stripe-hosted billing portal so a tenant admin can manage/cancel. */
billingRouter.get("/portal", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const stripe = getStripeClient();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.session.tenantId!));
    if (!tenant?.stripeCustomerId) {
      return res.status(400).json({ error: "No billing account yet — start a checkout first" });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${originOf(req)}/billing`,
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

/**
 * Stripe webhook handler — deliberately NOT registered on billingRouter.
 * app.ts mounts this directly at /api/billing/webhook with express.raw()
 * BEFORE the global express.json() middleware, since signature verification
 * needs the exact raw request body bytes, not a parsed JSON object.
 */
export async function stripeWebhookHandler(req: Request, res: Response) {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return res.status(400).json({ error: "Webhook not configured" });
  }

  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return res.status(400).json({ error: "Invalid signature" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const tenantId = Number(session.metadata?.tenantId);
        if (tenantId && session.subscription) {
          if (session.metadata?.kind === "addon") {
            await db
              .update(tenants)
              .set({ addonStripeSubscriptionId: String(session.subscription), addonStatus: "active" })
              .where(eq(tenants.id, tenantId));
          } else {
            await db
              .update(tenants)
              .set({
                stripeSubscriptionId: String(session.subscription),
                subscriptionStatus: "active",
                billingPlan: session.metadata?.plan ?? null,
              })
              .where(eq(tenants.id, tenantId));
          }
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const tenantId = Number(subscription.metadata?.tenantId);
        if (tenantId) {
          if (subscription.metadata?.kind === "addon") {
            await db
              .update(tenants)
              .set({
                addonStripeSubscriptionId: subscription.id,
                // mapStripeStatus only ever returns "active" | "past_due" | "cancelled" in
                // practice (trialing collapses to "active") — the add-on has no trial state.
                addonStatus: mapStripeStatus(subscription.status) as "active" | "past_due" | "cancelled",
              })
              .where(eq(tenants.id, tenantId));
          } else {
            await db
              .update(tenants)
              .set({
                stripeSubscriptionId: subscription.id,
                subscriptionStatus: mapStripeStatus(subscription.status),
              })
              .where(eq(tenants.id, tenantId));
          }
        }
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    res.status(500).json({ error: "Webhook handler failed" });
  }
}
