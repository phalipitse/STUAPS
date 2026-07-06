import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { institutions } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { getStaffInstitutionScope } from "../lib/tenantScope.js";

export const institutionsRouter = Router();
institutionsRouter.use(requireAuth);

institutionsRouter.get("/", async (req, res) => {
  const scope =
    req.session.role === "staff" ? await getStaffInstitutionScope(req.session.userId!) : null;

  const rows = await db
    .select()
    .from(institutions)
    .where(
      scope
        ? and(eq(institutions.tenantId, req.session.tenantId!), inArray(institutions.id, scope))
        : eq(institutions.tenantId, req.session.tenantId!)
    );
  res.json(rows);
});

const createSchema = z.object({
  name: z.string().min(1),
  invoicePrefix: z.string().min(1),
});

institutionsRouter.post("/", requireRole("admin"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const [row] = await db
    .insert(institutions)
    .values({ ...parsed.data, tenantId: req.session.tenantId! })
    .returning();
  res.status(201).json(row);
});

institutionsRouter.get("/:id", async (req, res) => {
  const [row] = await db
    .select()
    .from(institutions)
    .where(
      and(eq(institutions.id, Number(req.params.id)), eq(institutions.tenantId, req.session.tenantId!))
    );
  if (!row) return res.status(404).json({ error: "Institution not found" });
  res.json(row);
});
