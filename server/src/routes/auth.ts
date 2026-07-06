import { Router } from "express";
import { z } from "zod";
import { eq, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, tenants } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { startOtp, verifyOtp } from "../lib/otpFlow.js";

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  const { username, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.username, username));
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId));

  req.session.userId = user.id;
  req.session.tenantId = user.tenantId;
  req.session.role = user.role;
  req.session.isSuperAdmin = user.isSuperAdmin;

  res.json({
    user: { id: user.id, username: user.username, role: user.role, isSuperAdmin: user.isSuperAdmin },
    tenant: tenant
      ? {
          id: tenant.id,
          companyName: tenant.companyName,
          subscriptionStatus: tenant.subscriptionStatus,
          trialEndsAt: tenant.trialEndsAt,
          billingPlan: tenant.billingPlan,
          addonStatus: tenant.addonStatus,
        }
      : null,
  });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

const GENERIC_RESET_MESSAGE =
  "If an account matches that username or email, a verification code has been sent.";

interface PasswordResetPayload {
  userId: number | null;
}

const forgotStartSchema = z.object({
  usernameOrEmail: z.string().min(1),
});

authRouter.post("/forgot-password/start", async (req, res) => {
  const parsed = forgotStartSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Username or email is required" });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(
      or(
        eq(users.username, parsed.data.usernameOrEmail),
        eq(users.email, parsed.data.usernameOrEmail)
      )
    );

  const destinations =
    user?.email ? [{ contact: user.email, type: "email" as const }] : [];

  const { token, expiresInMinutes } = await startOtp(destinations, {
    userId: user?.id ?? null,
  } satisfies PasswordResetPayload);

  res.json({ resetToken: token, expiresInMinutes, message: GENERIC_RESET_MESSAGE });
});

const forgotVerifySchema = z.object({
  resetToken: z.string().min(1),
  code: z.string().length(6),
  newPassword: z.string().min(8),
});

authRouter.post("/forgot-password/verify", async (req, res) => {
  const parsed = forgotVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const result = await verifyOtp<PasswordResetPayload>(parsed.data.resetToken, parsed.data.code);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  if (result.payload.userId === null) {
    // No account matched at /start — behave exactly like an incorrect code.
    return res.status(400).json({ error: "Incorrect code" });
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, result.payload.userId));

  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!));
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId));

  res.json({
    user: { id: user.id, username: user.username, role: user.role, isSuperAdmin: user.isSuperAdmin },
    tenant: tenant
      ? {
          id: tenant.id,
          companyName: tenant.companyName,
          subscriptionStatus: tenant.subscriptionStatus,
          trialEndsAt: tenant.trialEndsAt,
          billingPlan: tenant.billingPlan,
          addonStatus: tenant.addonStatus,
        }
      : null,
  });
});
