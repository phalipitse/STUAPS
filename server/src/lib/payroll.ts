// Payslip math — pure functions over plain data, same style as recon.ts and
// financialStatements.ts. Deliberately no PAYE/UIF calculation: deductions
// (and any extra earnings, e.g. overtime or a bonus) are manual line items
// the admin enters per payslip, not a built-in tax formula.

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface PayslipLine {
  type: "earning" | "deduction";
  description: string;
  amount: number;
}

export interface PayslipSummary {
  grossSalary: number;
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
}

export function summarizePayslip(grossSalary: number, lines: PayslipLine[]): PayslipSummary {
  const totalEarnings = round2(
    lines.filter((l) => l.type === "earning").reduce((sum, l) => sum + l.amount, 0)
  );
  const totalDeductions = round2(
    lines.filter((l) => l.type === "deduction").reduce((sum, l) => sum + l.amount, 0)
  );
  const netPay = round2(grossSalary + totalEarnings - totalDeductions);

  return { grossSalary: round2(grossSalary), totalEarnings, totalDeductions, netPay };
}
