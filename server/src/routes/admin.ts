import { Router } from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { tenants, users, invoices, institutions } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireSuperAdmin } from "../middleware/requireRole.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireSuperAdmin);

/** Platform-wide overview for Pits Marketing: every tenant, plan, and outstanding total. */
adminRouter.get("/tenants", async (_req, res) => {
  const rows = await db
    .select({
      id: tenants.id,
      companyName: tenants.companyName,
      contactEmail: tenants.contactEmail,
      subscriptionStatus: tenants.subscriptionStatus,
      trialEndsAt: tenants.trialEndsAt,
      createdAt: tenants.createdAt,
      institutionCount: sql<number>`count(distinct ${institutions.id})`,
      invoiceCount: sql<number>`count(distinct ${invoices.id})`,
    })
    .from(tenants)
    .leftJoin(institutions, eq(institutions.tenantId, tenants.id))
    .leftJoin(invoices, eq(invoices.institutionId, institutions.id))
    .where(eq(tenants.isSuperAdminTenant, false))
    .groupBy(tenants.id);

  res.json(rows);
});

const statusSchema = z.object({
  subscriptionStatus: z.enum(["trial", "active", "past_due", "cancelled"]),
  trialEndsAt: z.string().datetime().optional(),
});

/** Manually override a tenant's subscription status (e.g. comp an account, mark past-due). */
adminRouter.patch("/tenants/:id/subscription", async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const [row] = await db
    .update(tenants)
    .set({
      subscriptionStatus: parsed.data.subscriptionStatus,
      ...(parsed.data.trialEndsAt ? { trialEndsAt: new Date(parsed.data.trialEndsAt) } : {}),
    })
    .where(eq(tenants.id, Number(req.params.id)))
    .returning();
  if (!row) return res.status(404).json({ error: "Tenant not found" });
  res.json(row);
});

adminRouter.get("/tenants/:id/users", async (req, res) => {
  const rows = await db
    .select({ id: users.id, username: users.username, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.tenantId, Number(req.params.id)));
  res.json(rows);
});
