import { describe, it, expect } from "vitest";
import { parseBankStatementCsv, BankStatementParseError } from "../src/lib/bankStatementParser.js";

describe("parseBankStatementCsv", () => {
  it("parses a single-amount-column export (positive = credit, negative = debit)", () => {
    const csv = [
      "Date,Description,Amount,Balance",
      "01/07/2026,Salary payment,15000.00,20000.00",
      "03/07/2026,Office rent,-8000.00,12000.00",
    ].join("\n");

    const rows = parseBankStatementCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ date: "2026-07-01", description: "Salary payment", amount: 15000, dateParsed: true });
    expect(rows[1]).toEqual({ date: "2026-07-03", description: "Office rent", amount: -8000, dateParsed: true });
  });

  it("parses a separate debit/credit column export", () => {
    const csv = [
      "Transaction Date,Narration,Debit,Credit",
      "2026-07-01,Client deposit,,5000.00",
      "2026-07-02,Stationery,450.50,",
    ].join("\n");

    const rows = parseBankStatementCsv(csv);
    expect(rows[0].amount).toBe(5000);
    expect(rows[1].amount).toBe(-450.5);
  });

  it("parses 'DD Mon YYYY' style dates and rand-formatted amounts", () => {
    const csv = ["Date,Details,Amount", "05 Jul 2026,Fuel,R -650.00"].join("\n");
    const rows = parseBankStatementCsv(csv);
    expect(rows[0].date).toBe("2026-07-05");
    expect(rows[0].amount).toBe(-650);
    expect(rows[0].dateParsed).toBe(true);
  });

  it("flags unparseable dates instead of throwing", () => {
    const csv = ["Date,Description,Amount", "not-a-date,Mystery fee,-100.00"].join("\n");
    const rows = parseBankStatementCsv(csv);
    expect(rows[0].dateParsed).toBe(false);
    expect(rows[0].date).toBe("not-a-date");
  });

  it("throws a clear error when no recognisable columns exist", () => {
    const csv = ["Foo,Bar", "1,2"].join("\n");
    expect(() => parseBankStatementCsv(csv)).toThrow(BankStatementParseError);
  });

  it("skips blank rows", () => {
    const csv = ["Date,Description,Amount", "01/07/2026,Payment,100.00", ",,"].join("\n");
    const rows = parseBankStatementCsv(csv);
    expect(rows).toHaveLength(1);
  });
});
