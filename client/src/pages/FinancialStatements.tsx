import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../lib/api";
import { formatRand } from "../lib/format";

interface Expense {
  id: number;
  date: string;
  category: string;
  description: string | null;
  amount: string;
  paid: boolean;
}

interface IncomeStatement {
  revenue: number;
  expensesByCategory: Array<{ category: string; amount: number }>;
  totalExpenses: number;
  netIncome: number;
}

interface CashFlowStatement {
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
}

interface BalanceSheet {
  accountsReceivable: number;
  cash: number;
  totalAssets: number;
  accountsPayable: number;
  totalLiabilities: number;
  equity: number;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function startOfYearIso() {
  return `${new Date().getFullYear()}-01-01`;
}

export function FinancialStatements() {
  const { tenant } = useAuth();
  const unlocked = tenant?.addonStatus === "active";

  const [from, setFrom] = useState(startOfYearIso());
  const [to, setTo] = useState(todayIso());
  const [asOf, setAsOf] = useState(todayIso());

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomeStatement, setIncomeStatement] = useState<IncomeStatement | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowStatement | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);

  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paid, setPaid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    const [expenseRows, income, cash, balance] = await Promise.all([
      api.get<Expense[]>(`/financial-statements/expenses?from=${from}&to=${to}`),
      api.get<IncomeStatement>(`/financial-statements/income-statement?from=${from}&to=${to}`),
      api.get<CashFlowStatement>(`/financial-statements/cash-flow?from=${from}&to=${to}`),
      api.get<BalanceSheet>(`/financial-statements/balance-sheet?asOf=${asOf}`),
    ]);
    setExpenses(expenseRows);
    setIncomeStatement(income);
    setCashFlow(cash);
    setBalanceSheet(balance);
  }

  useEffect(() => {
    if (!unlocked) return;
    refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, from, to, asOf]);

  async function addExpense(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/financial-statements/expenses", {
        date: expenseDate,
        category,
        description: description || undefined,
        amount: Number(amount),
        paid,
      });
      setCategory("");
      setDescription("");
      setAmount("");
      setPaid(true);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add expense");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeExpense(id: number) {
    await api.delete(`/financial-statements/expenses/${id}`);
    await refresh();
  }

  if (!unlocked) {
    return (
      <div className="page">
        <h1>Financial statements</h1>
        <p className="muted">
          Income statements, balance sheets, and cash flow reports are part of the Premium
          add-on.
        </p>
        <Link to="/billing">Upgrade to Premium →</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-heading-row">
        <h1>Financial statements</h1>
        <button className="no-print" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <p className="muted">
        Simplified, single-entry bookkeeping — revenue comes from your invoices, expenses from
        the ledger below. Not a substitute for a qualified accountant; treat this as a planning
        tool, not filing-ready statements.
      </p>

      <div className="inline-form no-print">
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          Balance sheet as of
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
      </div>

      <h2>Income statement</h2>
      <p className="muted">
        {from} to {to} — accrual basis (invoiced, not necessarily collected yet)
      </p>
      {incomeStatement && (
        <>
          <div className="kpi-row">
            <div className="kpi-tile">
              <span className="kpi-label">Revenue</span>
              <span className="kpi-value">{formatRand(incomeStatement.revenue)}</span>
            </div>
            <div className="kpi-tile">
              <span className="kpi-label">Total expenses</span>
              <span className="kpi-value">{formatRand(incomeStatement.totalExpenses)}</span>
            </div>
            <div className={`kpi-tile${incomeStatement.netIncome < 0 ? " kpi-outstanding" : ""}`}>
              <span className="kpi-label">Net income</span>
              <span className="kpi-value">{formatRand(incomeStatement.netIncome)}</span>
            </div>
          </div>
          {incomeStatement.expensesByCategory.length > 0 && (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeStatement.expensesByCategory.map((row) => (
                    <tr key={row.category}>
                      <td>{row.category}</td>
                      <td>{formatRand(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <h2>Cash flow</h2>
      <p className="muted">{from} to {to} — cash basis (money that actually moved)</p>
      {cashFlow && (
        <div className="kpi-row">
          <div className="kpi-tile">
            <span className="kpi-label">Cash in</span>
            <span className="kpi-value">{formatRand(cashFlow.cashIn)}</span>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Cash out</span>
            <span className="kpi-value">{formatRand(cashFlow.cashOut)}</span>
          </div>
          <div className={`kpi-tile${cashFlow.netCashFlow < 0 ? " kpi-outstanding" : ""}`}>
            <span className="kpi-label">Net cash flow</span>
            <span className="kpi-value">{formatRand(cashFlow.netCashFlow)}</span>
          </div>
        </div>
      )}

      <h2>Balance sheet</h2>
      <p className="muted">As of {asOf}</p>
      {balanceSheet && (
        <div className="kpi-row">
          <div className="kpi-tile">
            <span className="kpi-label">Accounts receivable</span>
            <span className="kpi-value">{formatRand(balanceSheet.accountsReceivable)}</span>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Cash collected</span>
            <span className="kpi-value">{formatRand(balanceSheet.cash)}</span>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Total assets</span>
            <span className="kpi-value">{formatRand(balanceSheet.totalAssets)}</span>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Accounts payable</span>
            <span className="kpi-value">{formatRand(balanceSheet.accountsPayable)}</span>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Equity</span>
            <span className="kpi-value">{formatRand(balanceSheet.equity)}</span>
          </div>
        </div>
      )}

      <h2>Expenses</h2>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Paid</th>
              <th className="no-print"></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td>{e.date}</td>
                <td>{e.category}</td>
                <td>{e.description ?? "—"}</td>
                <td>{formatRand(Number(e.amount))}</td>
                <td>{e.paid ? "Yes" : "No (accrued)"}</td>
                <td className="no-print">
                  <button className="link-button" onClick={() => removeExpense(e.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No expenses recorded for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h3 className="no-print">Add expense</h3>
      <form className="inline-form no-print" onSubmit={addExpense}>
        <label>
          Date
          <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
        </label>
        <label>
          Category
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Rent, Salaries, Utilities…"
            required
          />
        </label>
        <label>
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          Amount
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label>
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Already
          paid
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Adding…" : "Add expense"}
        </button>
      </form>
    </div>
  );
}
