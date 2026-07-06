import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { properties } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription.js";
import { assertInstitutionAccessible, ForbiddenError } from "../lib/tenantScope.js";

export const propertiesRouter = Router();
propertiesRouter.use(requireAuth, requireActiveSubscription);

propertiesRouter.get("/", async (req, res, next) => {
  try {
    const institutionId = Number(req.query.institutionId);
    if (!institutionId) {
      return res.status(400).json({ error: "institutionId query param is required" });
    }
    await assertInstitutionAccessible(institutionId, {
      tenantId: req.session.tenantId!,
      userId: req.session.userId!,
      role: req.session.role!,
    });
    const rows = await db
      .select()
      .from(properties)
      .where(eq(properties.institutionId, institutionId));
    res.json(rows);
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});

const createSchema = z.object({
  institutionId: z.number().int(),
  name: z.string().min(1),
  address: z.string().optional(),
  capacity: z.number().int().positive().optional(),
});

propertiesRouter.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    await assertInstitutionAccessible(parsed.data.institutionId, {
      tenantId: req.session.tenantId!,
      userId: req.session.userId!,
      role: req.session.role!,
    });
    const [row] = await db.insert(properties).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});
