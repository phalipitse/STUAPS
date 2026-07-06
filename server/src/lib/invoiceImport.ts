import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { invoices, invoiceLineItems, students } from "../db/schema.js";
import type { ParsedInvoice } from "./csvParser.js";
import type { ParsedStatementLine } from "./pdfStatementParser.js";

/**
 * Creates or replaces an invoice + line items from a parsed CSV export, upserting
 * the student roster along the way. Shared by the manual CSV upload route and the
 * email-statement import (when a funder emails a CSV rather than a PDF).
 */
export async function importParsedCsvInvoice(
  institutionId: number,
  parsed: ParsedInvoice
): Promise<number> {
  return db.transaction(async (tx) => {
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
}

/**
 * Creates an invoice from a best-effort PDF statement parse. Line items are only
 * linked to an existing student when the extracted reference number matches that
 * institution's student roster exactly — never auto-creates a student from PDF
 * text, since a mis-extracted "reference" could otherwise fabricate a bogus record.
 * Unmatched lines are still imported, just without a student link, so the total
 * is visible even when the per-student breakdown couldn't be confirmed.
 */
export async function importParsedPdfStatement(params: {
  institutionId: number;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  lines: ParsedStatementLine[];
  totalAmount: number;
}): Promise<number> {
  const { institutionId, invoiceNumber, invoiceDate, dueDate, lines, totalAmount } = params;

  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .insert(invoices)
      .values({
        institutionId,
        invoiceNumber,
        invoiceDate,
        dueDate,
        total: totalAmount.toString(),
        status: "outstanding",
      })
      .returning();

    for (const line of lines) {
      let studentId: number | null = null;
      if (line.reference) {
        const [student] = await tx
          .select()
          .from(students)
          .where(
            and(
              eq(students.institutionId, institutionId),
              eq(students.studentNumber, line.reference)
            )
          );
        studentId = student?.id ?? null;
      }

      await tx.insert(invoiceLineItems).values({
        invoiceId: invoice.id,
        studentId,
        description: line.description,
        quantity: "1",
        unitAmount: line.amount.toString(),
        lineTotal: line.amount.toString(),
        isFee: studentId === null,
      });
    }

    return invoice.id;
  });
}
