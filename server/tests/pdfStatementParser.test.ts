import { describe, it, expect } from "vitest";
import { parseStatementText } from "../src/lib/pdfStatementParser.js";

describe("parseStatementText", () => {
  it("extracts reference, description and amount from tabular-looking lines", () => {
    const text = `
      NSFAS Accommodation Statement
      Student 220123456 Accommodation fee 4500.00
      Student 220987654 Accommodation fee 4750.50
      Grand Total: R9250.50
    `;
    const result = parseStatementText(text);
    expect(result.confidence).toBe("structured");
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toEqual({
      reference: "220123456",
      description: "Student Accommodation fee",
      amount: 4500.0,
    });
    expect(result.totalAmount).toBe(9250.5);
  });

  it("falls back to total-only when no line items are recognisable", () => {
    const text = "Statement summary\nTotal Due: R12,345.67\nThank you for your business.";
    const result = parseStatementText(text);
    expect(result.confidence).toBe("total-only");
    expect(result.lines).toHaveLength(0);
    expect(result.totalAmount).toBe(12345.67);
  });

  it("reports unparsed when neither line items nor a total are found", () => {
    const result = parseStatementText("Just some prose with no numbers in it at all.");
    expect(result.confidence).toBe("unparsed");
    expect(result.totalAmount).toBeNull();
  });

  it("does not double-count the grand total line as a charge line", () => {
    const text = "Line one 100.00\nGrand Total 100.00";
    const result = parseStatementText(text);
    expect(result.lines).toHaveLength(1);
    expect(result.totalAmount).toBe(100);
  });
});
