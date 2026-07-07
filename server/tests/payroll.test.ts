import { describe, it, expect } from "vitest";
import { summarizePayslip } from "../src/lib/payroll.js";

describe("summarizePayslip", () => {
  it("nets gross salary against earnings and deductions", () => {
    const result = summarizePayslip(15000, [
      { type: "earning", description: "Overtime", amount: 500 },
      { type: "deduction", description: "PAYE", amount: 1200 },
      { type: "deduction", description: "UIF", amount: 150 },
    ]);
    expect(result).toEqual({
      grossSalary: 15000,
      totalEarnings: 500,
      totalDeductions: 1350,
      netPay: 14150,
    });
  });

  it("handles a payslip with no line items", () => {
    const result = summarizePayslip(10000, []);
    expect(result).toEqual({
      grossSalary: 10000,
      totalEarnings: 0,
      totalDeductions: 0,
      netPay: 10000,
    });
  });

  it("allows deductions to exceed gross salary (negative net pay is surfaced, not hidden)", () => {
    const result = summarizePayslip(1000, [
      { type: "deduction", description: "Loan repayment", amount: 5000 },
    ]);
    expect(result.netPay).toBe(-4000);
  });
});
