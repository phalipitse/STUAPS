import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { waitlistSignups } from "../db/schema.js";

export const waitlistRouter = Router();

const signupSchema = z.object({
  fullName: z.string().min(1).max(255),
  email: z.string().email(),
  companyName: z.string().max(255).optional(),
  country: z.string().max(64).optional(),
  propertyCount: z.string().max(32).optional(),
});

waitlistRouter.post("/", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  try {
    await db.insert(waitlistSignups).values(parsed.data);
  } catch (err: unknown) {
    // Unique email constraint — already on the list is a success from the
    // caller's point of view, not an error.
    const isDuplicate =
      err instanceof Error && "code" in err && (err as { code?: string }).code === "23505";
    if (!isDuplicate) throw err;
  }

  res.status(201).json({ ok: true });
});
