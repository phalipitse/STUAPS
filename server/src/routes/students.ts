import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { students } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { assertInstitutionAccessible, ForbiddenError } from "../lib/tenantScope.js";

export const studentsRouter = Router();
studentsRouter.use(requireAuth);

studentsRouter.get("/", async (req, res, next) => {
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
    const rows = await db.select().from(students).where(eq(students.institutionId, institutionId));
    res.json(rows);
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  surname: z.string().min(1).optional(),
  residence: z.string().optional(),
  campus: z.string().optional(),
});

studentsRouter.patch("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const [existing] = await db
      .select()
      .from(students)
      .where(eq(students.id, Number(req.params.id)));
    if (!existing) return res.status(404).json({ error: "Student not found" });
    await assertInstitutionAccessible(existing.institutionId, {
      tenantId: req.session.tenantId!,
      userId: req.session.userId!,
      role: req.session.role!,
    });

    const [row] = await db
      .update(students)
      .set(parsed.data)
      .where(eq(students.id, existing.id))
      .returning();
    res.json(row);
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});
