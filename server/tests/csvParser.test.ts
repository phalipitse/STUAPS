import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseInvoiceCsv, CsvParseError } from "../src/lib/csvParser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, "fixtures/TUT-01294.csv"), "utf-8");

describe("parseInvoiceCsv", () => {
  it("parses header fields from the real TUT-01294 export", () => {
    const parsed = parseInvoiceCsv(fixture);
    expect(parsed.header.invoiceNumber).toBe("TUT-01294");
    expect(parsed.header.invoiceDate).toBe("2026-07-01");
    expect(parsed.header.dueDate).toBe("2026-07-01");
    expect(parsed.header.total).toBe(71247.3);
  });

  it("splits student lines from fee lines", () => {
    const parsed = parseInvoiceCsv(fixture);
    const studentLines = parsed.lines.filter((l) => l.kind === "student");
    const feeLines = parsed.lines.filter((l) => l.kind === "fee");
    expect(studentLines).toHaveLength(16);
    expect(feeLines).toHaveLength(2);
  });

  it("extracts student number, name and surname per the 'SURNAME NAME' convention", () => {
    const parsed = parseInvoiceCsv(fixture);
    const first = parsed.lines.find(
      (l) => l.kind === "student" && l.studentNumber === "221520572"
    );
    expect(first).toMatchObject({
      kind: "student",
      studentNumber: "221520572",
      surname: "MATHEBULA",
      name: "NDZALAMA GANTY",
      residence: "SAINT POWERPOINT",
      lineTotal: 4933.2,
    });
  });

  it("parses fee lines with negative amounts and excludes them from student matching", () => {
    const parsed = parseInvoiceCsv(fixture);
    const fees = parsed.lines.filter((l) => l.kind === "fee");
    expect(fees.map((f) => f.description)).toEqual([
      "BITVENTURE PROCESSING FEE",
      "TUTEH MANAGEMENT FEE",
    ]);
    expect(fees.map((f) => f.lineTotal)).toEqual([-3064.4, -2298.3]);
  });

  it("computes a total that matches the invoice's stated Total (71,247.30)", () => {
    const parsed = parseInvoiceCsv(fixture);
    expect(parsed.computedTotal).toBe(71247.3);
    expect(parsed.totalMatchesStatedTotal).toBe(true);
  });

  it("throws a CsvParseError when a required column is missing", () => {
    const broken = fixture.replace("InvoiceNumber,", "");
    expect(() => parseInvoiceCsv(broken)).toThrow(CsvParseError);
  });

  it("flags a mismatch when line totals don't sum to the stated Total", () => {
    const tampered = fixture.replace("4933.2000", "5000.0000");
    const parsed = parseInvoiceCsv(tampered);
    expect(parsed.totalMatchesStatedTotal).toBe(false);
  });
});
