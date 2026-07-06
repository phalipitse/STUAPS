import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { invoices, invoiceLineItems, students } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription.js";
import { assertInstitutionAccessible, ForbiddenError } from "../lib/tenantScope.js";
import { parseInvoiceCsv, CsvParseError } from "../lib/csvParser.js";
import { summarizeInvoice } from "../lib/recon.js";

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth, requireActiveSubscription);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

invoicesRouter.get("/", async (req, res, next) => {
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
      .from(invoices)
      .where(eq(invoices.institutionId, institutionId))
      .orderBy(invoices.invoiceDate);
    res.json(rows);
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});

invoicesRouter.get("/:id", async (req, res, next) => {
  try {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, Number(req.params.id)));
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    await assertInstitutionAccessible(invoice.institutionId, {
      tenantId: req.session.tenantId!,
      userId: req.session.userId!,
      role: req.session.role!,
    });

    const lines = await db
      .select({
        id: invoiceLineItems.id,
        studentId: invoiceLineItems.studentId,
        description: invoiceLineItems.description,
        quantity: invoiceLineItems.quantity,
        unitAmount: invoiceLineItems.unitAmount,
        lineTotal: invoiceLineItems.lineTotal,
        isFee: invoiceLineItems.isFee,
        studentNumber: students.studentNumber,
        studentName: students.name,
        studentSurname: students.surname,
      })
      .from(invoiceLineItems)
      .leftJoin(students, eq(invoiceLineItems.studentId, students.id))
      .where(eq(invoiceLineItems.invoiceId, invoice.id));

    const summary = summarizeInvoice({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      status: invoice.status,
      amountPaid: Number(invoice.amountPaid),
      lines: lines.map((l) => ({ isFee: l.isFee, lineTotal: Number(l.lineTotal) })),
    });

    res.json({ invoice, lines, summary });
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});

/**
 * Upload a monthly invoice CSV for an institution. Parses student + fee lines,
 * upserts the student roster (a student is created the first time they appear
 * and kept even if a later invoice drops them), and replaces the invoice's line
 * items if the same invoice number is re-uploaded.
 */
invoicesRouter.post(
  "/upload",
  requireRole("admin"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      const institutionId = Number(req.body.institutionId);
      if (!institutionId) {
        return res.status(400).json({ error: "institutionId is required" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "CSV file is required" });
      }
      await assertInstitutionAccessible(institutionId, {
      tenantId: req.session.tenantId!,
      userId: req.session.userId!,
      role: req.session.role!,
    });

      let parsed;
      try {
        parsed = parseInvoiceCsv(req.file.buffer.toString("utf-8"));
      } catch (err) {
        if (err instanceof CsvParseError) {
          return res.status(422).json({ error: `Could not parse CSV: ${err.message}` });
        }
        throw err;
      }

      if (!parsed.totalMatchesStatedTotal) {
        return res.status(422).json({
          error: `Line items sum to ${parsed.computedTotal} but the invoice states a Total of ${parsed.header.total}. Upload rejected — check the export for missing/extra rows.`,
        });
      }

      const result = await db.transaction(async (tx) => {
        const [existingInvoice] = await tx
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.institutionId, institutionId),
              eq(invoices.invoiceNumber, parsed.header.invoiceNumber)
            )
          );

        let invoiceId: number;
        if (existingInvoice) {
          invoiceId = existingInvoice.id;
          await tx
            .update(invoices)
            .set({
              invoiceDate: parsed.header.invoiceDate,
              dueDate: parsed.header.dueDate,
              total: parsed.header.total.toString(),
            })
            .where(eq(invoices.id, invoiceId));
          await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId));
        } else {
          const [created] = await tx
            .insert(invoices)
            .values({
              institutionId,
              invoiceNumber: parsed.header.invoiceNumber,
              invoiceDate: parsed.header.invoiceDate,
              dueDate: parsed.header.dueDate,
              total: parsed.header.total.toString(),
              status: "outstanding",
            })
            .returning();
          invoiceId = created.id;
        }

        for (const line of parsed.lines) {
          if (line.kind === "fee") {
            await tx.insert(invoiceLineItems).values({
              invoiceId,
              studentId: null,
              description: line.description,
              quantity: line.quantity.toString(),
              unitAmount: line.unitAmount.toString(),
              lineTotal: line.lineTotal.toString(),
              isFee: true,
            });
            continue;
          }

          let [student] = await tx
            .select()
            .from(students)
            .where(
              and(
                eq(students.institutionId, institutionId),
                eq(students.studentNumber, line.studentNumber)
              )
            );
          if (!student) {
            [student] = await tx
              .insert(students)
              .values({
                institutionId,
                studentNumber: line.studentNumber,
                name: line.name,
                surname: line.surname,
                residence: line.residence,
                firstSeenInvoiceId: invoiceId,
              })
              .returning();
          }

          await tx.insert(invoiceLineItems).values({
            invoiceId,
            studentId: student.id,
            description: line.description,
            quantity: line.quantity.toString(),
            unitAmount: line.unitAmount.toString(),
            lineTotal: line.lineTotal.toString(),
            isFee: false,
          });
        }

        return invoiceId;
      });

      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, result));
      res.status(201).json({ invoice, studentLines: parsed.lines.length });
    } catch (err) {
      if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
      next(err);
    }
  }
);

const statusSchema = z.object({
  status: z.enum(["outstanding", "paid", "partial"]),
  amountPaid: z.number().nonnegative().optional(),
  note: z.string().optional(),
});

invoicesRouter.patch("/:id/status", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, Number(req.params.id)));
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    await assertInstitutionAccessible(invoice.institutionId, {
      tenantId: req.session.tenantId!,
      userId: req.session.userId!,
      role: req.session.role!,
    });

    const [row] = await db
      .update(invoices)
      .set({
        status: parsed.data.status,
        amountPaid:
          parsed.data.amountPaid !== undefined
            ? parsed.data.amountPaid.toString()
            : parsed.data.status === "paid"
              ? invoice.total
              : invoice.amountPaid,
        paidAt: parsed.data.status === "paid" ? new Date() : invoice.paidAt,
        note: parsed.data.note ?? invoice.note,
      })
      .where(eq(invoices.id, invoice.id))
      .returning();
    res.json(row);
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});
