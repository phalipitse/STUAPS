import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../lib/api";
import { formatRand } from "../lib/format";
import { isSpeechRecognitionSupported, recognizeSpeech } from "../lib/speechRecognition";

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

interface ExtractedExpense {
  date: string;
  category: string;
  description: string;
  amount: number;
  confidence: "high" | "medium" | "low";
}

interface ParsedBankRow {
  date: string;
  description: string;
  amount: number;
  dateParsed: boolean;
}

interface PreviewRow extends ParsedBankRow {
  selected: boolean;
  category: string;
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

  const [claudeConfigured, setClaudeConfigured] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [listening, setListening] = useState(false);
  const [extractionNotice, setExtractionNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [statementRows, setStatementRows] = useState<PreviewRow[]>([]);
  const [statementParsing, setStatementParsing] = useState(false);
  const [statementImporting, setStatementImporting] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);
  const statementInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!unlocked) return;
    api
      .get<{ claudeConfigured: boolean }>("/financial-statements/status")
      .then((res) => setClaudeConfigured(res.claudeConfigured))
      .catch(() => {});
  }, [unlocked]);

  function applyExtracted(extracted: ExtractedExpense) {
    setExpenseDate(extracted.date || todayIso());
    setCategory(extracted.category || "");
    setDescription(extracted.description || "");
    setAmount(extracted.amount ? String(extracted.amount) : "");
    setExtractionNotice(
      `Extracted (${extracted.confidence} confidence) — review the fields below before saving.`
    );
  }

  async function handleDocumentSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setScanning(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const extracted = await api.upload<ExtractedExpense>(
        "/financial-statements/expenses/extract-from-document",
        form
      );
      applyExtracted(extracted);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not read that document");
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleUseMicrophone() {
    setError(null);
    setListening(true);
    try {
      const transcript = await recognizeSpeech();
      const extracted = await api.post<ExtractedExpense>("/financial-statements/expenses/extract-from-text", {
        text: transcript,
      });
      applyExtracted(extracted);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Voice input failed");
    } finally {
      setListening(false);
    }
  }

  async function handleStatementSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatementError(null);
    setStatementRows([]);
    setStatementParsing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { transactions } = await api.upload<{ transactions: ParsedBankRow[] }>(
        "/financial-statements/bank-statement/parse",
        form
      );
      setStatementRows(
        transactions.map((t) => ({
          ...t,
          // Debits (money out) are the ones this app can turn into expenses; credits
          // (money in) usually correspond to invoice payments already tracked
          // elsewhere, so pre-select only debits to avoid double-counting revenue.
          selected: t.amount < 0 && t.dateParsed,
          category: "",
        }))
      );
    } catch (err) {
      setStatementError(err instanceof ApiError ? err.message : "Could not read that bank statement");
    } finally {
      setStatementParsing(false);
      if (statementInputRef.current) statementInputRef.current.value = "";
    }
  }

  function updateStatementRow(index: number, patch: Partial<PreviewRow>) {
    setStatementRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function importSelectedStatementRows() {
    setStatementError(null);
    setStatementImporting(true);
    try {
      const toImport = statementRows.filter((r) => r.selected && r.amount < 0);
      for (const row of toImport) {
        await api.post("/financial-statements/expenses", {
          date: row.dateParsed ? row.date : todayIso(),
          category: row.category || "Uncategorized",
          description: row.description || undefined,
          amount: Math.abs(row.amount),
          paid: true,
        });
      }
      setStatementRows((rows) => rows.filter((r) => !(r.selected && r.amount < 0)));
      await refresh();
    } catch (err) {
      setStatementError(err instanceof ApiError ? err.message : "Could not import the selected transactions");
    } finally {
      setStatementImporting(false);
    }
  }

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
      setExtractionNotice(null);
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

      <h2 className="no-print">Import bank statement</h2>
      <p className="muted no-print">
        Upload a bank statement export (CSV) or a photographed/scanned statement page (PDF or
        image) to preview its transactions. Only money-out rows (debits) can be imported as
        expenses here — money-in rows are shown for reference but excluded, since revenue is
        already tracked from your invoices and importing them too would double-count it.
      </p>
      <div className="inline-form no-print">
        <label>
          Upload statement
          <input
            ref={statementInputRef}
            type="file"
            accept=".csv,text/csv,image/jpeg,image/png,image/gif,image/webp,application/pdf"
            onChange={handleStatementSelected}
            disabled={statementParsing}
          />
        </label>
        {statementParsing && <span className="muted">Reading statement…</span>}
      </div>
      {statementError && <p className="error no-print">{statementError}</p>}
      {statementRows.length > 0 && (
        <div className="no-print">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {statementRows.map((row, i) => {
                  const isDebit = row.amount < 0;
                  return (
                    <tr key={i}>
                      <td>
                        {isDebit ? (
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(e) => updateStatementRow(i, { selected: e.target.checked })}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {row.date}
                        {!row.dateParsed && <span className="muted"> (unrecognised date)</span>}
                      </td>
                      <td>{row.description || "—"}</td>
                      <td>{formatRand(Math.abs(row.amount))} {isDebit ? "out" : "in"}</td>
                      <td>
                        {isDebit ? (
                          <input
                            value={row.category}
                            onChange={(e) => updateStatementRow(i, { category: e.target.value })}
                            placeholder="Rent, Salaries, Utilities…"
                          />
                        ) : (
                          <span className="muted">Not imported</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={importSelectedStatementRows}
            disabled={statementImporting || !statementRows.some((r) => r.selected && r.amount < 0)}
          >
            {statementImporting ? "Importing…" : "Import selected as expenses"}
          </button>
        </div>
      )}

      <h3 className="no-print">Add expense</h3>
      {claudeConfigured ? (
        <div className="inline-form no-print">
          <label>
            Scan a document
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              onChange={handleDocumentSelected}
              disabled={scanning}
            />
          </label>
          {isSpeechRecognitionSupported() && (
            <button type="button" onClick={handleUseMicrophone} disabled={listening}>
              {listening ? "Listening…" : "🎤 Use microphone"}
            </button>
          )}
          {scanning && <span className="muted">Reading document…</span>}
        </div>
      ) : (
        <p className="muted no-print">
          Photo/PDF scanning and voice entry aren't configured on this server yet.
        </p>
      )}
      {extractionNotice && <p className="muted no-print">{extractionNotice}</p>}
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
