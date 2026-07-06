import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { tenants } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { getStripeClient, getStripePriceId, mapStripeStatus } from "../lib/stripe.js";

export const billingRouter = Router();

function originOf(req: { protocol: string; get: (h: string) => string | undefined }) {
  return `${req.protocol}://${req.get("host")}`;
}

/** Starts (or resumes) a Stripe Checkout session for the caller's tenant. */
billingRouter.post("/checkout", requireAuth, requireRole("admin"), async (req, res, next) => {
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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: getStripePriceId(), quantity: 1 }],
      success_url: `${originOf(req)}/billing?checkout=success`,
      cancel_url: `${originOf(req)}/billing?checkout=cancelled`,
      metadata: { tenantId: String(tenant.id) },
      subscription_data: { metadata: { tenantId: String(tenant.id) } },
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
          await db
            .update(tenants)
            .set({
              stripeSubscriptionId: String(session.subscription),
              subscriptionStatus: "active",
            })
            .where(eq(tenants.id, tenantId));
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const tenantId = Number(subscription.metadata?.tenantId);
        if (tenantId) {
          await db
            .update(tenants)
            .set({
              stripeSubscriptionId: subscription.id,
              subscriptionStatus: mapStripeStatus(subscription.status),
            })
            .where(eq(tenants.id, tenantId));
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
