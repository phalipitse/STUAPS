// Cross-invoice reconciliation engine — pure functions over plain data so they're
// easy to unit test without a database.

export interface ReconInvoiceSummary {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  status: "outstanding" | "paid" | "partial";
  studentCharges: number;
  feeCredits: number;
  invoiceTotal: number;
  amountPaid: number;
  amountDue: number;
}

export interface ReconStudentLine {
  invoiceId: number;
  invoiceNumber: string;
  studentId: number;
  billedAmount: number;
}

export interface StudentRow {
  studentId: number;
  studentNumber: string;
  name: string;
  surname: string;
  residence: string | null;
  campus: string | null;
}

export interface StudentBillingSummary extends StudentRow {
  billedByInvoice: Record<number, number>; // invoiceId -> amount
  totalBilled: number;
  outstandingByInvoice: Array<{ invoiceId: number; invoiceNumber: string; amount: number }>;
  totalOutstanding: number;
  overallStatusLabel: string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Builds an invoice-level reconciliation summary from its line items. */
export function summarizeInvoice(params: {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  status: "outstanding" | "paid" | "partial";
  amountPaid: number;
  lines: Array<{ isFee: boolean; lineTotal: number }>;
}): ReconInvoiceSummary {
  const studentCharges = round2(
    params.lines.filter((l) => !l.isFee).reduce((sum, l) => sum + l.lineTotal, 0)
  );
  const feeCredits = round2(
    params.lines.filter((l) => l.isFee).reduce((sum, l) => sum + l.lineTotal, 0)
  );
  const invoiceTotal = round2(studentCharges + feeCredits);
  const amountDue = round2(invoiceTotal - params.amountPaid);

  return {
    invoiceId: params.invoiceId,
    invoiceNumber: params.invoiceNumber,
    invoiceDate: params.invoiceDate,
    status: params.status,
    studentCharges,
    feeCredits,
    invoiceTotal,
    amountPaid: round2(params.amountPaid),
    amountDue,
  };
}

/** Aggregates every invoice's summaries into the grand reconciliation totals. */
export function summarizeAllInvoices(invoiceSummaries: ReconInvoiceSummary[]) {
  const totalStudentCharges = round2(
    invoiceSummaries.reduce((s, i) => s + i.studentCharges, 0)
  );
  const totalFeeCredits = round2(invoiceSummaries.reduce((s, i) => s + i.feeCredits, 0));
  const totalInvoiced = round2(invoiceSummaries.reduce((s, i) => s + i.invoiceTotal, 0));
  const totalPaid = round2(invoiceSummaries.reduce((s, i) => s + i.amountPaid, 0));
  const totalOutstanding = round2(invoiceSummaries.reduce((s, i) => s + i.amountDue, 0));

  return {
    totalStudentCharges,
    totalFeeCredits,
    totalInvoiced,
    totalPaid,
    totalOutstanding,
  };
}

/**
 * Builds the per-student cross-invoice billing summary — the "MAY PAYMENT SUMMARY" /
 * "TOTAL REPORT" view: one row per student across the whole roster, with billed
 * amounts per invoice and an overall outstanding breakdown.
 */
export function buildStudentBillingSummary(
  students: StudentRow[],
  lines: ReconStudentLine[],
  invoiceStatusById: Map<number, "outstanding" | "paid" | "partial">,
  invoiceNumberById: Map<number, string>
): StudentBillingSummary[] {
  const linesByStudent = new Map<number, ReconStudentLine[]>();
  for (const line of lines) {
    const arr = linesByStudent.get(line.studentId) ?? [];
    arr.push(line);
    linesByStudent.set(line.studentId, arr);
  }

  return students.map((student) => {
    const studentLines = linesByStudent.get(student.studentId) ?? [];
    const billedByInvoice: Record<number, number> = {};
    for (const line of studentLines) {
      billedByInvoice[line.invoiceId] = round2(
        (billedByInvoice[line.invoiceId] ?? 0) + line.billedAmount
      );
    }

    const totalBilled = round2(
      Object.values(billedByInvoice).reduce((s, v) => s + v, 0)
    );

    const outstandingByInvoice = Object.entries(billedByInvoice)
      .map(([invoiceIdStr, amount]) => {
        const invoiceId = Number(invoiceIdStr);
        return {
          invoiceId,
          invoiceNumber: invoiceNumberById.get(invoiceId) ?? String(invoiceId),
          amount,
          status: invoiceStatusById.get(invoiceId) ?? "outstanding",
        };
      })
      .filter((entry) => entry.status !== "paid")
      .map(({ invoiceId, invoiceNumber, amount }) => ({ invoiceId, invoiceNumber, amount }));

    const totalOutstanding = round2(
      outstandingByInvoice.reduce((s, v) => s + v.amount, 0)
    );

    const overallStatusLabel =
      studentLines.length === 0
        ? "Not invoiced"
        : Object.keys(billedByInvoice)
            .map((invoiceIdStr) => {
              const invoiceId = Number(invoiceIdStr);
              const status = invoiceStatusById.get(invoiceId) ?? "outstanding";
              const label = invoiceNumberById.get(invoiceId) ?? String(invoiceId);
              return `${label} ${status}`;
            })
            .join("; ");

    return {
      ...student,
      billedByInvoice,
      totalBilled,
      outstandingByInvoice,
      totalOutstanding,
      overallStatusLabel,
    };
  });
}

/** Filters the student billing summary down to students who owe money. */
export function listOutstandingStudents(
  summaries: StudentBillingSummary[]
): StudentBillingSummary[] {
  return summaries
    .filter((s) => s.totalOutstanding > 0)
    .sort((a, b) => b.totalOutstanding - a.totalOutstanding);
}
