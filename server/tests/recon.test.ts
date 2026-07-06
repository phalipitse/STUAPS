import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseInvoiceCsv } from "../src/lib/csvParser.js";
import {
  summarizeInvoice,
  summarizeAllInvoices,
  buildStudentBillingSummary,
  listOutstandingStudents,
  type StudentRow,
  type ReconStudentLine,
} from "../src/lib/recon.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "fixtures/TUT-01294.csv"), "utf-8");

describe("summarizeInvoice (against the real TUT-01294 export)", () => {
  it("separates student charges from fee credits and nets to the invoice total", () => {
    const parsed = parseInvoiceCsv(fixture);
    const summary = summarizeInvoice({
      invoiceId: 1,
      invoiceNumber: parsed.header.invoiceNumber,
      invoiceDate: parsed.header.invoiceDate,
      status: "outstanding",
      amountPaid: 0,
      lines: parsed.lines.map((l) => ({ isFee: l.kind === "fee", lineTotal: l.lineTotal })),
    });

    expect(summary.studentCharges).toBe(76610);
    expect(summary.feeCredits).toBe(-5362.7);
    expect(summary.invoiceTotal).toBe(71247.3);
    expect(summary.amountDue).toBe(71247.3);
  });

  it("computes amount due as invoice total minus amount paid", () => {
    const parsed = parseInvoiceCsv(fixture);
    const summary = summarizeInvoice({
      invoiceId: 1,
      invoiceNumber: parsed.header.invoiceNumber,
      invoiceDate: parsed.header.invoiceDate,
      status: "paid",
      amountPaid: 71247.3,
      lines: parsed.lines.map((l) => ({ isFee: l.kind === "fee", lineTotal: l.lineTotal })),
    });
    expect(summary.amountDue).toBe(0);
  });
});

describe("summarizeAllInvoices", () => {
  it("aggregates April (paid), May and July (outstanding) as in the original recon", () => {
    const april = summarizeInvoice({
      invoiceId: 1,
      invoiceNumber: "TUT-00107",
      invoiceDate: "2026-04-01",
      status: "paid",
      amountPaid: 206810.42,
      lines: [
        { isFee: false, lineTotal: 222376.8 },
        { isFee: true, lineTotal: -15566.38 },
      ],
    });
    const may = summarizeInvoice({
      invoiceId: 2,
      invoiceNumber: "TUT-00521",
      invoiceDate: "2026-05-01",
      status: "outstanding",
      amountPaid: 0,
      lines: [
        { isFee: false, lineTotal: 110400 },
        { isFee: true, lineTotal: -7728 },
      ],
    });
    const july = summarizeInvoice({
      invoiceId: 3,
      invoiceNumber: "TUT-01294",
      invoiceDate: "2026-07-01",
      status: "outstanding",
      amountPaid: 0,
      lines: [
        { isFee: false, lineTotal: 76610 },
        { isFee: true, lineTotal: -5362.7 },
      ],
    });

    const totals = summarizeAllInvoices([april, may, july]);
    expect(totals.totalStudentCharges).toBe(409386.8);
    expect(totals.totalInvoiced).toBe(380729.72);
    expect(totals.totalPaid).toBe(206810.42);
    expect(totals.totalOutstanding).toBe(173919.3);
  });
});

describe("buildStudentBillingSummary / listOutstandingStudents", () => {
  const students: StudentRow[] = [
    { studentId: 1, studentNumber: "1001", name: "THANDO", surname: "NTSANGANI", residence: "SAINT POWERPOINT", campus: "TUT SOSH" },
    { studentId: 2, studentNumber: "1002", name: "TSHEPO", surname: "MOLEPO", residence: "SAINT POWERPOINT", campus: "TUT SOSH" },
    { studentId: 3, studentNumber: "1003", name: "NEVER", surname: "INVOICED", residence: "SAINT POWERPOINT", campus: "TUT SOSH" },
  ];

  const invoiceStatusById = new Map<number, "outstanding" | "paid" | "partial">([
    [1, "paid"], // April
    [2, "outstanding"], // May
    [3, "outstanding"], // July
  ]);
  const invoiceNumberById = new Map<number, string>([
    [1, "TUT-00107"],
    [2, "TUT-00521"],
    [3, "TUT-01294"],
  ]);

  // Student 1 (NTSANGANI) billed on all three invoices; student 2 (MOLEPO) only
  // on April+May (dropped from July, matching the real roster-change scenario);
  // student 3 has never been invoiced.
  const lines: ReconStudentLine[] = [
    { invoiceId: 1, invoiceNumber: "TUT-00107", studentId: 1, billedAmount: 13800 },
    { invoiceId: 2, invoiceNumber: "TUT-00521", studentId: 1, billedAmount: 4600 },
    { invoiceId: 3, invoiceNumber: "TUT-01294", studentId: 1, billedAmount: 4600 },
    { invoiceId: 1, invoiceNumber: "TUT-00107", studentId: 2, billedAmount: 13943.4 },
    { invoiceId: 2, invoiceNumber: "TUT-00521", studentId: 2, billedAmount: 4600 },
  ];

  it("computes total billed per student across all invoices", () => {
    const summary = buildStudentBillingSummary(
      students,
      lines,
      invoiceStatusById,
      invoiceNumberById
    );
    const ntsangani = summary.find((s) => s.studentNumber === "1001")!;
    expect(ntsangani.totalBilled).toBe(23000);
    const molepo = summary.find((s) => s.studentNumber === "1002")!;
    expect(molepo.totalBilled).toBe(18543.4);
  });

  it("marks a student with no line items across any invoice as 'Not invoiced'", () => {
    const summary = buildStudentBillingSummary(
      students,
      lines,
      invoiceStatusById,
      invoiceNumberById
    );
    const neverInvoiced = summary.find((s) => s.studentNumber === "1003")!;
    expect(neverInvoiced.overallStatusLabel).toBe("Not invoiced");
    expect(neverInvoiced.totalOutstanding).toBe(0);
  });

  it("excludes paid invoices from a student's outstanding total", () => {
    const summary = buildStudentBillingSummary(
      students,
      lines,
      invoiceStatusById,
      invoiceNumberById
    );
    const ntsangani = summary.find((s) => s.studentNumber === "1001")!;
    // April (13800) is paid, so only May + July (4600 + 4600) should count.
    expect(ntsangani.totalOutstanding).toBe(9200);

    const molepo = summary.find((s) => s.studentNumber === "1002")!;
    // April paid, May outstanding, no July line at all (dropped from roster that month).
    expect(molepo.totalOutstanding).toBe(4600);
  });

  it("listOutstandingStudents returns only students who owe money, sorted descending", () => {
    const summary = buildStudentBillingSummary(
      students,
      lines,
      invoiceStatusById,
      invoiceNumberById
    );
    const outstanding = listOutstandingStudents(summary);
    expect(outstanding.map((s) => s.studentNumber)).toEqual(["1001", "1002"]);
    expect(outstanding[0].totalOutstanding).toBeGreaterThanOrEqual(
      outstanding[1].totalOutstanding
    );
  });
});
