import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, institutions, userInstitutionAccess } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { hashPassword } from "../lib/auth.js";

export const teamRouter = Router();
teamRouter.use(requireAuth, requireRole("admin"));

/** Confirms every given institution ID belongs to the tenant, or throws a 400. */
async function assertAllInstitutionsInTenant(institutionIds: number[], tenantId: number) {
  if (institutionIds.length === 0) return;
  const rows = await db
    .select({ id: institutions.id })
    .from(institutions)
    .where(and(eq(institutions.tenantId, tenantId), inArray(institutions.id, institutionIds)));
  if (rows.length !== new Set(institutionIds).size) {
    throw new Error("One or more institutions do not belong to this tenant");
  }
}

teamRouter.get("/", async (req, res) => {
  const tenantUsers = await db
    .select({ id: users.id, username: users.username, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.tenantId, req.session.tenantId!));

  const access = await db
    .select({ userId: userInstitutionAccess.userId, institutionId: userInstitutionAccess.institutionId })
    .from(userInstitutionAccess)
    .where(
      inArray(
        userInstitutionAccess.userId,
        tenantUsers.map((u) => u.id)
      )
    );

  const accessByUser = new Map<number, number[]>();
  for (const row of access) {
    const list = accessByUser.get(row.userId) ?? [];
    list.push(row.institutionId);
    accessByUser.set(row.userId, list);
  }

  res.json(
    tenantUsers.map((u) => ({
      ...u,
      // Empty = full tenant access (see user_institution_access convention).
      institutionIds: accessByUser.get(u.id) ?? [],
    }))
  );
});

const createSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
  institutionIds: z.array(z.number().int()).default([]),
});

teamRouter.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const { username, email, password, institutionIds } = parsed.data;

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (existing) {
      return res.status(409).json({ error: "Username is already taken" });
    }

    await assertAllInstitutionsInTenant(institutionIds, req.session.tenantId!);

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({
        tenantId: req.session.tenantId!,
        username,
        email,
        passwordHash,
        role: "staff",
      })
      .returning();

    if (institutionIds.length > 0) {
      await db
        .insert(userInstitutionAccess)
        .values(institutionIds.map((institutionId) => ({ userId: user.id, institutionId })));
    }

    res.status(201).json({ id: user.id, username: user.username, email: user.email, role: user.role, institutionIds });
  } catch (err) {
    if (err instanceof Error && err.message.includes("do not belong")) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

const accessSchema = z.object({
  institutionIds: z.array(z.number().int()),
});

teamRouter.patch("/:id/access", async (req, res, next) => {
  try {
    const parsed = accessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const userId = Number(req.params.id);
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, req.session.tenantId!)));
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.role !== "staff") {
      return res.status(400).json({ error: "Institution access only applies to staff accounts" });
    }

    await assertAllInstitutionsInTenant(parsed.data.institutionIds, req.session.tenantId!);

    await db.delete(userInstitutionAccess).where(eq(userInstitutionAccess.userId, userId));
    if (parsed.data.institutionIds.length > 0) {
      await db
        .insert(userInstitutionAccess)
        .values(parsed.data.institutionIds.map((institutionId) => ({ userId, institutionId })));
    }

    res.json({ id: userId, institutionIds: parsed.data.institutionIds });
  } catch (err) {
    if (err instanceof Error && err.message.includes("do not belong")) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

teamRouter.delete("/:id", async (req, res) => {
  const userId = Number(req.params.id);
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, req.session.tenantId!)));
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role === "admin") {
    return res.status(400).json({ error: "Cannot remove an admin account from here" });
  }

  await db.delete(users).where(eq(users.id, userId));
  res.status(204).send();
});
