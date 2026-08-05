import { Router } from "express";
import { z } from "zod";
import { eq, desc, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { properties, pestControlTreatments } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription.js";
import { assertInstitutionAccessible, ForbiddenError } from "../lib/tenantScope.js";
import { treatmentStatus } from "../lib/pestControl.js";

export const pestControlRouter = Router();
pestControlRouter.use(requireAuth, requireActiveSubscription);

function today() {
  return new Date().toISOString().slice(0, 10);
}

pestControlRouter.get("/", async (req, res, next) => {
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

    const propertyRows = await db
      .select()
      .from(properties)
      .where(eq(properties.institutionId, institutionId));

    const treatments = propertyRows.length
      ? await db
          .select()
          .from(pestControlTreatments)
          .where(
            inArray(
              pestControlTreatments.propertyId,
              propertyRows.map((p) => p.id)
            )
          )
          .orderBy(desc(pestControlTreatments.treatedOn))
      : [];

    const now = today();
    res.json(
      propertyRows.map((property) => {
        const history = treatments.filter((t) => t.propertyId === property.id);
        const { status, nextDueOn } = treatmentStatus(history[0]?.treatedOn ?? null, now);
        return {
          propertyId: property.id,
          propertyName: property.name,
          address: property.address,
          lastTreatedOn: history[0]?.treatedOn ?? null,
          lastCompanyName: history[0]?.companyName ?? null,
          nextDueOn,
          status,
          treatments: history,
        };
      })
    );
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});

const createSchema = z.object({
  propertyId: z.number().int(),
  treatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "treatedOn must be a YYYY-MM-DD date"),
  companyName: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(255).optional()),
  notes: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
});

pestControlRouter.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }

    const [property] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, parsed.data.propertyId));
    if (!property) return res.status(404).json({ error: "Property not found" });

    await assertInstitutionAccessible(property.institutionId, {
      tenantId: req.session.tenantId!,
      userId: req.session.userId!,
      role: req.session.role!,
    });

    const [row] = await db.insert(pestControlTreatments).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});
