import { describe, it, expect } from "vitest";
import { computeIncomeStatement, computeCashFlow, computeBalanceSheet } from "../src/lib/financialStatements.js";

describe("computeIncomeStatement", () => {
  it("computes revenue, expenses by category, and net income", () => {
    const result = computeIncomeStatement({
      invoiceTotals: [71247.3, 10000],
      expenses: [
        { category: "Rent", amount: 20000 },
        { category: "Utilities", amount: 3000 },
        { category: "Rent", amount: 500 }, // second rent entry, same period
      ],
    });

    expect(result.revenue).toBe(81247.3);
    expect(result.expensesByCategory).toEqual([
      { category: "Rent", amount: 20500 },
      { category: "Utilities", amount: 3000 },
    ]);
    expect(result.totalExpenses).toBe(23500);
    expect(result.netIncome).toBe(57747.3);
  });

  it("handles zero revenue and zero expenses", () => {
    const result = computeIncomeStatement({ invoiceTotals: [], expenses: [] });
    expect(result).toEqual({
      revenue: 0,
      expensesByCategory: [],
      totalExpenses: 0,
      netIncome: 0,
    });
  });

  it("allows a net loss (expenses exceed revenue)", () => {
    const result = computeIncomeStatement({
      invoiceTotals: [1000],
      expenses: [{ category: "Salaries", amount: 5000 }],
    });
    expect(result.netIncome).toBe(-4000);
  });
});

describe("computeCashFlow", () => {
  it("nets cash in against cash out", () => {
    const result = computeCashFlow({
      paymentsReceived: [5000, 2500.5],
      paidExpenses: [1200, 300],
    });
    expect(result.cashIn).toBe(7500.5);
    expect(result.cashOut).toBe(1500);
    expect(result.netCashFlow).toBe(6000.5);
  });
});

describe("computeBalanceSheet", () => {
  it("sums assets and liabilities and plugs equity", () => {
    const result = computeBalanceSheet({
      outstandingInvoiceBalances: [71247.3, 1000],
      cashCollected: [5000],
      unpaidExpenses: [2000],
    });
    expect(result.accountsReceivable).toBe(72247.3);
    expect(result.cash).toBe(5000);
    expect(result.totalAssets).toBe(77247.3);
    expect(result.accountsPayable).toBe(2000);
    expect(result.totalLiabilities).toBe(2000);
    expect(result.equity).toBe(75247.3);
  });

  it("handles an all-zero balance sheet", () => {
    const result = computeBalanceSheet({
      outstandingInvoiceBalances: [],
      cashCollected: [],
      unpaidExpenses: [],
    });
    expect(result.totalAssets).toBe(0);
    expect(result.totalLiabilities).toBe(0);
    expect(result.equity).toBe(0);
  });
});
