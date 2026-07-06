import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { tenants } from "../db/schema.js";

/**
 * Gates the core app (everything tenant-scoped) behind an active subscription
 * or a still-running trial. Call after requireAuth. Super-admins (Pits
 * Marketing staff) always pass through regardless of their own tenant's
 * billing state, since they need the platform to investigate other tenants.
 */
export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (req.session.isSuperAdmin) return next();

  const [tenant] = await db
    .select({ subscriptionStatus: tenants.subscriptionStatus, trialEndsAt: tenants.trialEndsAt })
    .from(tenants)
    .where(eq(tenants.id, req.session.tenantId!));

  if (!tenant) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const trialStillActive =
    tenant.subscriptionStatus === "trial" &&
    tenant.trialEndsAt !== null &&
    tenant.trialEndsAt.getTime() > Date.now();

  if (tenant.subscriptionStatus === "active" || trialStillActive) {
    return next();
  }

  res.status(402).json({
    error: "Your trial has ended. Subscribe to keep using Student Accommodation Recon.",
    code: "SUBSCRIPTION_REQUIRED",
  });
}
