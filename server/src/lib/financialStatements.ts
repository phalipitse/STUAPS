// Simplified financial statement calculations — pure functions over plain data
// so they're easy to unit test without a database. Deliberately simplified:
// this is single-entry bookkeeping (invoices as revenue, an expense ledger,
// no full chart of accounts), not a substitute for a qualified accountant.
// See README for the specific simplifications (no per-payment ledger yet, so
// cash timing relies on each invoice's single paidAt snapshot).

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface ExpenseRow {
  category: string;
  amount: number;
}

export interface IncomeStatement {
  revenue: number;
  expensesByCategory: Array<{ category: string; amount: number }>;
  totalExpenses: number;
  netIncome: number;
}

/** Accrual-basis income statement: revenue = invoiced totals in the period, regardless of payment. */
export function computeIncomeStatement(params: {
  invoiceTotals: number[];
  expenses: ExpenseRow[];
}): IncomeStatement {
  const revenue = round2(params.invoiceTotals.reduce((sum, v) => sum + v, 0));

  const byCategory = new Map<string, number>();
  for (const e of params.expenses) {
    byCategory.set(e.category, round2((byCategory.get(e.category) ?? 0) + e.amount));
  }
  const expensesByCategory = [...byCategory.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const totalExpenses = round2(expensesByCategory.reduce((sum, e) => sum + e.amount, 0));

  return {
    revenue,
    expensesByCategory,
    totalExpenses,
    netIncome: round2(revenue - totalExpenses),
  };
}

export interface CashFlowStatement {
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
}

/** Cash-basis view: money that actually moved in the period. */
export function computeCashFlow(params: {
  paymentsReceived: number[];
  paidExpenses: number[];
}): CashFlowStatement {
  const cashIn = round2(params.paymentsReceived.reduce((sum, v) => sum + v, 0));
  const cashOut = round2(params.paidExpenses.reduce((sum, v) => sum + v, 0));
  return { cashIn, cashOut, netCashFlow: round2(cashIn - cashOut) };
}

export interface BalanceSheet {
  accountsReceivable: number;
  cash: number;
  totalAssets: number;
  accountsPayable: number;
  totalLiabilities: number;
  equity: number;
}

/** Point-in-time snapshot as of a given date. Equity is a plug (assets - liabilities), not tracked separately. */
export function computeBalanceSheet(params: {
  outstandingInvoiceBalances: number[];
  cashCollected: number[];
  unpaidExpenses: number[];
}): BalanceSheet {
  const accountsReceivable = round2(params.outstandingInvoiceBalances.reduce((sum, v) => sum + v, 0));
  const cash = round2(params.cashCollected.reduce((sum, v) => sum + v, 0));
  const totalAssets = round2(accountsReceivable + cash);

  const accountsPayable = round2(params.unpaidExpenses.reduce((sum, v) => sum + v, 0));
  const totalLiabilities = accountsPayable;

  const equity = round2(totalAssets - totalLiabilities);

  return { accountsReceivable, cash, totalAssets, accountsPayable, totalLiabilities, equity };
}
