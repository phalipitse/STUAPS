import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { tenants } from "../db/schema.js";

/**
 * Gates Premium features (financial statements + payroll) behind the separate
 * add-on subscription. Call after requireAuth + requireActiveSubscription —
 * this only checks the add-on, not base access. Super-admins bypass it, same
 * convention as requireActiveSubscription.
 */
export async function requirePremiumAddon(req: Request, res: Response, next: NextFunction) {
  if (req.session.isSuperAdmin) return next();

  const [tenant] = await db
    .select({ addonStatus: tenants.addonStatus })
    .from(tenants)
    .where(eq(tenants.id, req.session.tenantId!));

  if (tenant?.addonStatus === "active") {
    return next();
  }

  res.status(402).json({
    error: "Financial statements and payroll are part of the Premium add-on.",
    code: "ADDON_REQUIRED",
  });
}
