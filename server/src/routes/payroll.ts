import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { employees, payslips, payslipLineItems } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription.js";
import { requirePremiumAddon } from "../middleware/requirePremiumAddon.js";
import { summarizePayslip } from "../lib/payroll.js";

export const payrollRouter = Router();
payrollRouter.use(requireAuth, requireActiveSubscription, requirePremiumAddon);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---- Employees ----

const employeeSchema = z.object({
  name: z.string().min(1).max(255),
  idNumber: z.string().min(1).max(32),
  jobTitle: z.string().max(255).optional(),
  startDate: z.string().regex(DATE_RE, "startDate must be YYYY-MM-DD").optional(),
  monthlySalary: z.number().positive(),
});

payrollRouter.get("/employees", async (req, res) => {
  const rows = await db
    .select()
    .from(employees)
    .where(eq(employees.tenantId, req.session.tenantId!))
    .orderBy(employees.name);
  res.json(rows);
});

payrollRouter.post("/employees", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = employeeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const [row] = await db
      .insert(employees)
      .values({
        tenantId: req.session.tenantId!,
        name: parsed.data.name,
        idNumber: parsed.data.idNumber,
        jobTitle: parsed.data.jobTitle ?? null,
        startDate: parsed.data.startDate ?? null,
        monthlySalary: parsed.data.monthlySalary.toString(),
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

const employeeUpdateSchema = employeeSchema.partial().extend({ active: z.boolean().optional() });

payrollRouter.patch("/employees/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = employeeUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const [existing] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, Number(req.params.id)), eq(employees.tenantId, req.session.tenantId!)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const { monthlySalary, ...rest } = parsed.data;
    const [row] = await db
      .update(employees)
      .set({ ...rest, ...(monthlySalary !== undefined ? { monthlySalary: monthlySalary.toString() } : {}) })
      .where(eq(employees.id, existing.id))
      .returning();
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// ---- Payslips ----

const payslipLineSchema = z.object({
  type: z.enum(["earning", "deduction"]),
  description: z.string().min(1),
  amount: z.number().positive(),
});

const payslipSchema = z.object({
  employeeId: z.number().int().positive(),
  periodStart: z.string().regex(DATE_RE, "periodStart must be YYYY-MM-DD"),
  grossSalary: z.number().positive(),
  lines: z.array(payslipLineSchema).default([]),
});

payrollRouter.get("/payslips", async (req, res) => {
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
  const rows = await db
    .select()
    .from(payslips)
    .where(
      employeeId
        ? and(eq(payslips.tenantId, req.session.tenantId!), eq(payslips.employeeId, employeeId))
        : eq(payslips.tenantId, req.session.tenantId!)
    )
    .orderBy(desc(payslips.periodStart));
  res.json(rows);
});

payrollRouter.post("/payslips", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = payslipSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const [employee] = await db
      .select()
      .from(employees)
      .where(
        and(eq(employees.id, parsed.data.employeeId), eq(employees.tenantId, req.session.tenantId!))
      );
    if (!employee) return res.status(404).json({ error: "Employee not found" });

    const [existing] = await db
      .select({ id: payslips.id })
      .from(payslips)
      .where(
        and(eq(payslips.employeeId, employee.id), eq(payslips.periodStart, parsed.data.periodStart))
      );
    if (existing) {
      return res.status(409).json({ error: "A payslip for this employee and period already exists" });
    }

    const payslipId = await db.transaction(async (tx) => {
      const [payslip] = await tx
        .insert(payslips)
        .values({
          tenantId: req.session.tenantId!,
          employeeId: employee.id,
          periodStart: parsed.data.periodStart,
          grossSalary: parsed.data.grossSalary.toString(),
        })
        .returning();

      for (const line of parsed.data.lines) {
        await tx.insert(payslipLineItems).values({
          payslipId: payslip.id,
          type: line.type,
          description: line.description,
          amount: line.amount.toString(),
        });
      }

      return payslip.id;
    });

    res.status(201).json({ id: payslipId });
  } catch (err) {
    next(err);
  }
});

payrollRouter.get("/payslips/:id", async (req, res, next) => {
  try {
    const [payslip] = await db
      .select()
      .from(payslips)
      .where(and(eq(payslips.id, Number(req.params.id)), eq(payslips.tenantId, req.session.tenantId!)));
    if (!payslip) return res.status(404).json({ error: "Not found" });

    const [employee] = await db.select().from(employees).where(eq(employees.id, payslip.employeeId));
    const lines = await db
      .select()
      .from(payslipLineItems)
      .where(eq(payslipLineItems.payslipId, payslip.id));

    const summary = summarizePayslip(
      Number(payslip.grossSalary),
      lines.map((l) => ({ type: l.type, description: l.description, amount: Number(l.amount) }))
    );

    res.json({ payslip, employee, lines, summary });
  } catch (err) {
    next(err);
  }
});

payrollRouter.delete("/payslips/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const [payslip] = await db
      .select()
      .from(payslips)
      .where(and(eq(payslips.id, Number(req.params.id)), eq(payslips.tenantId, req.session.tenantId!)));
    if (!payslip) return res.status(404).json({ error: "Not found" });
    await db.delete(payslips).where(eq(payslips.id, payslip.id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
