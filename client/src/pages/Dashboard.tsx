import { useEffect, useState } from "react";
import { useInstitutions } from "../institutions/InstitutionContext";
import { api } from "../lib/api";
import { formatRand } from "../lib/format";

interface InvoiceSummary {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  status: "outstanding" | "paid" | "partial";
  studentCharges: number;
  feeCredits: number;
  invoiceTotal: number;
  amountPaid: number;
  amountDue: number;
}

interface TotalReport {
  invoices: InvoiceSummary[];
  grandTotals: {
    totalStudentCharges: number;
    totalFeeCredits: number;
    totalInvoiced: number;
    totalPaid: number;
    totalOutstanding: number;
  };
}

export function Dashboard() {
  const { selectedId } = useInstitutions();
  const [report, setReport] = useState<TotalReport | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    api.get<TotalReport>(`/reports/total?institutionId=${selectedId}`).then(setReport);
  }, [selectedId]);

  if (!selectedId) {
    return (
      <div className="page">
        <p className="muted">Add an institution to get started.</p>
      </div>
    );
  }

  if (!report) return <div className="page">Loading…</div>;

  const { grandTotals } = report;

  return (
    <div className="page">
      <div className="page-heading-row">
        <h1>Dashboard</h1>
        <button className="no-print" onClick={() => window.print()}>
          Print report
        </button>
      </div>

      <div className="kpi-row">
        <div className="kpi-tile">
          <span className="kpi-label">Total billed</span>
          <span className="kpi-value">{formatRand(grandTotals.totalStudentCharges)}</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-label">Fee credits</span>
          <span className="kpi-value">{formatRand(grandTotals.totalFeeCredits)}</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-label">Total invoiced</span>
          <span className="kpi-value">{formatRand(grandTotals.totalInvoiced)}</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-label">Total paid</span>
          <span className="kpi-value">{formatRand(grandTotals.totalPaid)}</span>
        </div>
        <div className="kpi-tile kpi-outstanding">
          <span className="kpi-label">Total outstanding</span>
          <span className="kpi-value">{formatRand(grandTotals.totalOutstanding)}</span>
        </div>
      </div>

      <h2>Invoices</h2>
      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Date</th>
            <th>Student charges</th>
            <th>Fee credits</th>
            <th>Total</th>
            <th>Paid</th>
            <th>Due</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {report.invoices.map((inv) => (
            <tr key={inv.invoiceId} className={inv.status === "outstanding" ? "row-outstanding" : ""}>
              <td>{inv.invoiceNumber}</td>
              <td>{inv.invoiceDate}</td>
              <td>{formatRand(inv.studentCharges)}</td>
              <td>{formatRand(inv.feeCredits)}</td>
              <td>{formatRand(inv.invoiceTotal)}</td>
              <td>{formatRand(inv.amountPaid)}</td>
              <td>{formatRand(inv.amountDue)}</td>
              <td>
                <span className={`status-pill status-${inv.status}`}>{inv.status}</span>
              </td>
            </tr>
          ))}
          {report.invoices.length === 0 && (
            <tr>
              <td colSpan={8} className="muted">
                No invoices uploaded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
