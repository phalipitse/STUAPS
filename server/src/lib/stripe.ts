import Stripe from "stripe";

let client: Stripe | null = null;

/**
 * Lazily constructs the Stripe client so the server can boot (and every
 * non-billing route can work) even before STRIPE_SECRET_KEY is configured —
 * only billing routes fail until it's set, not the whole app.
 */
export function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return client;
}

export type BillingPlan = "monthly" | "annual";

export function getStripePriceId(plan: BillingPlan): string {
  const envVar = plan === "annual" ? "STRIPE_PRICE_ID_ANNUAL" : "STRIPE_PRICE_ID_MONTHLY";
  const priceId = process.env[envVar];
  if (!priceId) {
    throw new Error(`${envVar} is not configured`);
  }
  return priceId;
}

/** Maps a Stripe subscription status to our own tenant subscription_status enum. */
export function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status
): "trial" | "active" | "past_due" | "cancelled" {
  switch (stripeStatus) {
    case "trialing":
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "cancelled";
    default:
      return "past_due";
  }
}
