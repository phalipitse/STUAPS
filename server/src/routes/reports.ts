import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { invoices, invoiceLineItems, students } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription.js";
import { assertInstitutionAccessible, ForbiddenError } from "../lib/tenantScope.js";
import {
  summarizeInvoice,
  summarizeAllInvoices,
  buildStudentBillingSummary,
  listOutstandingStudents,
  type ReconStudentLine,
} from "../lib/recon.js";

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireActiveSubscription);

async function loadInstitutionData(institutionId: number) {
  const institutionInvoices = await db
    .select()
    .from(invoices)
    .where(eq(invoices.institutionId, institutionId));

  const institutionStudents = await db
    .select()
    .from(students)
    .where(eq(students.institutionId, institutionId));

  const invoiceIds = institutionInvoices.map((i) => i.id);
  const allLines = invoiceIds.length
    ? await db.select().from(invoiceLineItems)
    : [];
  const lines = allLines.filter((l) => invoiceIds.includes(l.invoiceId));

  return { institutionInvoices, institutionStudents, lines };
}

/** Per-invoice + grand-total reconciliation report for an institution. */
reportsRouter.get("/total", async (req, res, next) => {
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

    const { institutionInvoices, lines } = await loadInstitutionData(institutionId);

    const invoiceSummaries = institutionInvoices.map((invoice) =>
      summarizeInvoice({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        status: invoice.status,
        amountPaid: Number(invoice.amountPaid),
        lines: lines
          .filter((l) => l.invoiceId === invoice.id)
          .map((l) => ({ isFee: l.isFee, lineTotal: Number(l.lineTotal) })),
      })
    );

    res.json({
      invoices: invoiceSummaries,
      grandTotals: summarizeAllInvoices(invoiceSummaries),
    });
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});

/** Cross-invoice per-student billing summary (the "MAY PAYMENT SUMMARY" view). */
reportsRouter.get("/students", async (req, res, next) => {
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

    const { institutionInvoices, institutionStudents, lines } =
      await loadInstitutionData(institutionId);

    const invoiceStatusById = new Map(institutionInvoices.map((i) => [i.id, i.status]));
    const invoiceNumberById = new Map(institutionInvoices.map((i) => [i.id, i.invoiceNumber]));

    const studentLines: ReconStudentLine[] = lines
      .filter((l) => !l.isFee && l.studentId !== null)
      .map((l) => ({
        invoiceId: l.invoiceId,
        invoiceNumber: invoiceNumberById.get(l.invoiceId) ?? "",
        studentId: l.studentId!,
        billedAmount: Number(l.lineTotal),
      }));

    const summary = buildStudentBillingSummary(
      institutionStudents.map((s) => ({
        studentId: s.id,
        studentNumber: s.studentNumber,
        name: s.name,
        surname: s.surname,
        residence: s.residence,
        campus: s.campus,
      })),
      studentLines,
      invoiceStatusById,
      invoiceNumberById
    );

    res.json(summary);
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});

/** Who-owes-what: outstanding students only, sorted by amount owed descending. */
reportsRouter.get("/outstanding", async (req, res, next) => {
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

    const { institutionInvoices, institutionStudents, lines } =
      await loadInstitutionData(institutionId);

    const invoiceStatusById = new Map(institutionInvoices.map((i) => [i.id, i.status]));
    const invoiceNumberById = new Map(institutionInvoices.map((i) => [i.id, i.invoiceNumber]));

    const studentLines: ReconStudentLine[] = lines
      .filter((l) => !l.isFee && l.studentId !== null)
      .map((l) => ({
        invoiceId: l.invoiceId,
        invoiceNumber: invoiceNumberById.get(l.invoiceId) ?? "",
        studentId: l.studentId!,
        billedAmount: Number(l.lineTotal),
      }));

    const summary = buildStudentBillingSummary(
      institutionStudents.map((s) => ({
        studentId: s.id,
        studentNumber: s.studentNumber,
        name: s.name,
        surname: s.surname,
        residence: s.residence,
        campus: s.campus,
      })),
      studentLines,
      invoiceStatusById,
      invoiceNumberById
    );

    res.json(listOutstandingStudents(summary));
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});
