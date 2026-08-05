import { Router, type Request, type Response } from "express";
import { eq, lte, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { tenants, properties, pestControlTreatments } from "../db/schema.js";
import { treatmentStatus } from "../lib/pestControl.js";
import { chargeOverageForPeriod } from "../lib/usageBilling.js";

export const cronRouter = Router();

/** Vercel Cron signature verification header (X-Vercel-Cron) — can be checked against process.env.CRON_SECRET */
function verifyCronSignature(req: Request): boolean {
  if (!process.env.CRON_SECRET) return false;
  const signature = req.headers["x-vercel-cron"];
  return signature === process.env.CRON_SECRET;
}

/** Daily: Check pest control treatments and flag properties that are due. */
cronRouter.post("/pest-control-check", async (req, res, next) => {
  try {
    if (!verifyCronSignature(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const today = new Date().toISOString().split("T")[0];
    const allProps = await db.select().from(properties);

    const overdue = [];
    for (const prop of allProps) {
      const lastTreatment = await db
        .select()
        .from(pestControlTreatments)
        .where(eq(pestControlTreatments.propertyId, prop.id))
        .orderBy(pestControlTreatments.treatedOn)
        .limit(1);

      if (lastTreatment.length > 0) {
        const { status } = treatmentStatus(lastTreatment[0].treatedOn, today);
        if (status === "overdue") {
          overdue.push(prop);
        }
      } else {
        // Never treated
        overdue.push(prop);
      }
    }

    console.log(`Pest control check: ${overdue.length} properties overdue or never treated`);
    res.json({ checked: allProps.length, overdue: overdue.length });
  } catch (err) {
    next(err);
  }
});

/** Monthly: Charge overage for tenants with students above the allowance. Runs on the 1st of each month. */
cronRouter.post("/billing-overage", async (req, res, next) => {
  try {
    if (!verifyCronSignature(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const allTenants = await db.select().from(tenants).where(eq(tenants.subscriptionStatus, "active"));

    const results = [];
    for (const tenant of allTenants) {
      try {
        const result = await chargeOverageForPeriod(tenant.id);
        results.push({ tenantId: tenant.id, ...result });
      } catch (err) {
        console.error(`Overage charge failed for tenant ${tenant.id}:`, err);
        results.push({ tenantId: tenant.id, charged: false, reason: String(err) });
      }
    }

    const charged = results.filter((r) => r.charged).length;
    console.log(`Billing overage: processed ${results.length} tenants, ${charged} charged`);
    res.json({ processed: results.length, charged, results });
  } catch (err) {
    next(err);
  }
});
