import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { and, desc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { expenses, invoices, institutions } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription.js";
import { requirePremiumAddon } from "../middleware/requirePremiumAddon.js";
import { computeIncomeStatement, computeCashFlow, computeBalanceSheet } from "../lib/financialStatements.js";
import {
  isClaudeConfigured,
  extractExpenseFromDocument,
  extractExpenseFromText,
  extractTransactionsFromBankStatement,
} from "../lib/claudeExtraction.js";
import { parseBankStatementCsv, BankStatementParseError } from "../lib/bankStatementParser.js";

export const financialStatementsRouter = Router();
financialStatementsRouter.use(requireAuth, requireActiveSubscription, requirePremiumAddon);

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfYearIso(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function parseDateRange(query: Record<string, unknown>): { from: string; to: string } {
  const from = typeof query.from === "string" && DATE_RE.test(query.from) ? query.from : startOfYearIso();
  const to = typeof query.to === "string" && DATE_RE.test(query.to) ? query.to : todayIso();
  return { from, to };
}

// ---- Expenses (bookkeeping) ----

const expenseSchema = z.object({
  date: z.string().regex(DATE_RE, "date must be YYYY-MM-DD"),
  category: z.string().min(1).max(100),
  description: z.string().optional(),
  amount: z.number().positive(),
  paid: z.boolean().default(true),
});

financialStatementsRouter.get("/expenses", async (req, res, next) => {
  try {
    const { from, to } = parseDateRange(req.query as Record<string, unknown>);
    const rows = await db
      .select()
      .from(expenses)
      .where(
        and(eq(expenses.tenantId, req.session.tenantId!), gte(expenses.date, from), lte(expenses.date, to))
      )
      .orderBy(desc(expenses.date));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

financialStatementsRouter.post("/expenses", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const [row] = await db
      .insert(expenses)
      .values({
        tenantId: req.session.tenantId!,
        date: parsed.data.date,
        category: parsed.data.category,
        description: parsed.data.description ?? null,
        amount: parsed.data.amount.toString(),
        paid: parsed.data.paid,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

financialStatementsRouter.delete("/expenses/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const [row] = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, Number(req.params.id)), eq(expenses.tenantId, req.session.tenantId!)));
    if (!row) return res.status(404).json({ error: "Not found" });
    await db.delete(expenses).where(eq(expenses.id, row.id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

financialStatementsRouter.get("/status", (_req, res) => {
  res.json({ claudeConfigured: isClaudeConfigured() });
});

/**
 * AI-assisted expense entry: reads a photographed/scanned source document
 * (receipt, invoice, statement) and returns suggested expense fields for the
 * admin to review — nothing is saved here, same human-in-the-loop pattern as
 * the Gmail statement inbox. The document itself is sent to Anthropic's API
 * for processing and is not stored anywhere by this app.
 */
financialStatementsRouter.post(
  "/expenses/extract-from-document",
  requireRole("admin"),
  documentUpload.single("file"),
  async (req, res, next) => {
    try {
      if (!isClaudeConfigured()) {
        return res.status(400).json({ error: "Document scanning is not configured on this server yet" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "A file is required" });
      }
      const extracted = await extractExpenseFromDocument(req.file.buffer, req.file.mimetype);
      res.json(extracted);
    } catch (err) {
      next(err);
    }
  }
);

const extractFromTextSchema = z.object({ text: z.string().min(1).max(2000) });

/** Same as extract-from-document, but from a transcribed spoken description rather than a file. */
financialStatementsRouter.post("/expenses/extract-from-text", requireRole("admin"), async (req, res, next) => {
  try {
    if (!isClaudeConfigured()) {
      return res.status(400).json({ error: "Voice extraction is not configured on this server yet" });
    }
    const parsed = extractFromTextSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "text is required" });
    }
    const extracted = await extractExpenseFromText(parsed.data.text);
    res.json(extracted);
  } catch (err) {
    next(err);
  }
});

// ---- Bank statement import ----

const CSV_MIME_TYPES = ["text/csv", "application/csv", "application/vnd.ms-excel"];

/**
 * Parses an uploaded bank statement (CSV export, or a photographed/scanned PDF/image
 * page) into a preview list of transactions. Nothing is saved here — same
 * human-in-the-loop pattern as the other AI/CSV ingestion paths. The admin reviews
 * the preview and picks which rows to import as expenses via a separate call to the
 * existing POST /expenses endpoint (one row at a time; there's no bulk-insert here).
 */
financialStatementsRouter.post(
  "/bank-statement/parse",
  requireRole("admin"),
  documentUpload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "A file is required" });
      }
      const isCsv = CSV_MIME_TYPES.includes(req.file.mimetype) || req.file.originalname.toLowerCase().endsWith(".csv");

      if (isCsv) {
        try {
          const rows = parseBankStatementCsv(req.file.buffer.toString("utf-8"));
          return res.json({ transactions: rows });
        } catch (err) {
          if (err instanceof BankStatementParseError) {
            return res.status(400).json({ error: err.message });
          }
          throw err;
        }
      }

      if (!isClaudeConfigured()) {
        return res.status(400).json({ error: "Scanning PDF/image bank statements is not configured on this server yet — export a CSV instead" });
      }
      const extracted = await extractTransactionsFromBankStatement(req.file.buffer, req.file.mimetype);
      const transactions = extracted.map((t) => ({ ...t, dateParsed: DATE_RE.test(t.date) }));
      res.json({ transactions });
    } catch (err) {
      next(err);
    }
  }
);

// ---- Reports ----

/** Accrual-basis income statement: revenue = invoiced totals in the period, regardless of payment. */
financialStatementsRouter.get("/income-statement", async (req, res, next) => {
  try {
    const { from, to } = parseDateRange(req.query as Record<string, unknown>);
    const tenantId = req.session.tenantId!;

    const invoiceRows = await db
      .select({ total: invoices.total })
      .from(invoices)
      .innerJoin(institutions, eq(invoices.institutionId, institutions.id))
      .where(
        and(eq(institutions.tenantId, tenantId), gte(invoices.invoiceDate, from), lte(invoices.invoiceDate, to))
      );

    const expenseRows = await db
      .select({ category: expenses.category, amount: expenses.amount })
      .from(expenses)
      .where(and(eq(expenses.tenantId, tenantId), gte(expenses.date, from), lte(expenses.date, to)));

    const result = computeIncomeStatement({
      invoiceTotals: invoiceRows.map((r) => Number(r.total)),
      expenses: expenseRows.map((r) => ({ category: r.category, amount: Number(r.amount) })),
    });

    res.json({ from, to, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * Cash-basis view of money that actually moved in the period. Invoices marked
 * paid have a reliable paidAt timestamp; invoices merely "partial" don't (the
 * schema only stamps paidAt when status becomes "paid"), so their amountPaid
 * is counted against invoiceDate instead as a best-effort fallback — a real
 * simplification, flagged in the README, that a proper per-payment ledger
 * would remove.
 */
financialStatementsRouter.get("/cash-flow", async (req, res, next) => {
  try {
    const { from, to } = parseDateRange(req.query as Record<string, unknown>);
    const tenantId = req.session.tenantId!;
    const fromTs = new Date(`${from}T00:00:00.000Z`);
    const toTs = new Date(`${to}T23:59:59.999Z`);

    const paidWithTimestamp = await db
      .select({ amountPaid: invoices.amountPaid })
      .from(invoices)
      .innerJoin(institutions, eq(invoices.institutionId, institutions.id))
      .where(
        and(
          eq(institutions.tenantId, tenantId),
          isNotNull(invoices.paidAt),
          gte(invoices.paidAt, fromTs),
          lte(invoices.paidAt, toTs)
        )
      );

    const partialWithoutTimestamp = await db
      .select({ amountPaid: invoices.amountPaid })
      .from(invoices)
      .innerJoin(institutions, eq(invoices.institutionId, institutions.id))
      .where(
        and(
          eq(institutions.tenantId, tenantId),
          isNull(invoices.paidAt),
          gte(invoices.invoiceDate, from),
          lte(invoices.invoiceDate, to)
        )
      );

    const paidExpenseRows = await db
      .select({ amount: expenses.amount })
      .from(expenses)
      .where(
        and(
          eq(expenses.tenantId, tenantId),
          eq(expenses.paid, true),
          gte(expenses.date, from),
          lte(expenses.date, to)
        )
      );

    const result = computeCashFlow({
      paymentsReceived: [...paidWithTimestamp, ...partialWithoutTimestamp]
        .map((r) => Number(r.amountPaid))
        .filter((amount) => amount > 0),
      paidExpenses: paidExpenseRows.map((r) => Number(r.amount)),
    });

    res.json({ from, to, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * Point-in-time snapshot. Historical accuracy for a past `asOf` is limited by
 * the same lack of a payments ledger — amountPaid is always the invoice's
 * *current* running total, not what it was on that date.
 */
financialStatementsRouter.get("/balance-sheet", async (req, res, next) => {
  try {
    const asOfRaw = req.query.asOf;
    const asOf = typeof asOfRaw === "string" && DATE_RE.test(asOfRaw) ? asOfRaw : todayIso();
    const tenantId = req.session.tenantId!;

    const invoiceRows = await db
      .select({ total: invoices.total, amountPaid: invoices.amountPaid })
      .from(invoices)
      .innerJoin(institutions, eq(invoices.institutionId, institutions.id))
      .where(and(eq(institutions.tenantId, tenantId), lte(invoices.invoiceDate, asOf)));

    const outstandingInvoiceBalances = invoiceRows
      .map((r) => Number(r.total) - Number(r.amountPaid))
      .filter((balance) => balance > 0);
    const cashCollected = invoiceRows.map((r) => Number(r.amountPaid));

    const unpaidExpenseRows = await db
      .select({ amount: expenses.amount })
      .from(expenses)
      .where(and(eq(expenses.tenantId, tenantId), eq(expenses.paid, false), lte(expenses.date, asOf)));

    const result = computeBalanceSheet({
      outstandingInvoiceBalances,
      cashCollected,
      unpaidExpenses: unpaidExpenseRows.map((r) => Number(r.amount)),
    });

    res.json({ asOf, ...result });
  } catch (err) {
    next(err);
  }
});
