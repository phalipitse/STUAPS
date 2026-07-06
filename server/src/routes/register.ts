import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { tenants, users } from "../db/schema.js";
import { hashPassword } from "../lib/auth.js";
import { startOtp, verifyOtp } from "../lib/otpFlow.js";

export const registerRouter = Router();

const TRIAL_DAYS = 7;

interface PendingRegistration {
  companyName: string;
  contactName: string;
  email: string;
  cell?: string;
  province?: string;
  username: string;
  password: string;
}

const startSchema = z.object({
  companyName: z.string().min(1),
  contactName: z.string().min(1),
  email: z.string().email(),
  cell: z.string().min(6).optional(),
  province: z.string().optional(),
  channel: z.enum(["email", "sms", "both"]),
  username: z.string().min(3),
  password: z.string().min(8),
});

registerRouter.post("/start", async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const data = parsed.data;

  if (data.channel !== "email" && !data.cell) {
    return res.status(400).json({ error: "Cell number is required for SMS delivery" });
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, data.username));
  if (existingUser) {
    return res.status(409).json({ error: "Username is already taken" });
  }

  const destinations = [
    ...(data.channel === "email" || data.channel === "both"
      ? [{ contact: data.email, type: "email" as const }]
      : []),
    ...(data.channel === "sms" || data.channel === "both"
      ? [{ contact: data.cell!, type: "sms" as const }]
      : []),
  ];

  const { token, expiresInMinutes } = await startOtp(destinations, data satisfies PendingRegistration);

  res.json({ registrationToken: token, expiresInMinutes });
});

const verifySchema = z.object({
  registrationToken: z.string().min(1),
  code: z.string().length(6),
});

registerRouter.post("/verify", async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Registration token and code are required" });
  }

  const result = await verifyOtp<PendingRegistration>(parsed.data.registrationToken, parsed.data.code);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  const data = result.payload;

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, data.username));
  if (existingUser) {
    return res.status(409).json({ error: "Username is already taken" });
  }

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60_000);

  const [tenant] = await db
    .insert(tenants)
    .values({
      companyName: data.companyName,
      contactName: data.contactName,
      contactEmail: data.email,
      contactCell: data.cell,
      province: data.province,
      subscriptionStatus: "trial",
      trialEndsAt,
    })
    .returning();

  const passwordHash = await hashPassword(data.password);
  const [user] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      username: data.username,
      email: data.email,
      passwordHash,
      role: "admin",
    })
    .returning();

  req.session.userId = user.id;
  req.session.tenantId = tenant.id;
  req.session.role = user.role;
  req.session.isSuperAdmin = false;

  res.status(201).json({
    user: { id: user.id, username: user.username, role: user.role, isSuperAdmin: false },
    tenant: {
      id: tenant.id,
      companyName: tenant.companyName,
      subscriptionStatus: tenant.subscriptionStatus,
      trialEndsAt: tenant.trialEndsAt,
    },
  });
});
