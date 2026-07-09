import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { formatRand } from "../lib/format";

interface LineItem {
  id: number;
  studentId: number | null;
  description: string;
  quantity: string;
  unitAmount: string;
  lineTotal: string;
  isFee: boolean;
  studentNumber: string | null;
  studentName: string | null;
  studentSurname: string | null;
}

interface InvoiceDetailResponse {
  invoice: {
    id: number;
    invoiceNumber: string;
    invoiceDate: string;
    status: "outstanding" | "paid" | "partial";
  };
  lines: LineItem[];
  summary: {
    studentCharges: number;
    feeCredits: number;
    invoiceTotal: number;
    amountPaid: number;
    amountDue: number;
  };
}

export function InvoiceDetail() {
  const { id } = useParams();
  const [data, setData] = useState<InvoiceDetailResponse | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await api.get<InvoiceDetailResponse>(`/invoices/${id}`);
    setData(res);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function markPaid() {
    setUpdating(true);
    setError(null);
    try {
      await api.patch(`/invoices/${id}/status`, { status: "paid" });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update invoice status");
    } finally {
      setUpdating(false);
    }
  }

  async function markOutstanding() {
    setUpdating(true);
    setError(null);
    try {
      await api.patch(`/invoices/${id}/status`, { status: "outstanding", amountPaid: 0 });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update invoice status");
    } finally {
      setUpdating(false);
    }
  }

  if (!data) return <div className="page">Loading…</div>;

  const { invoice, lines, summary } = data;

  return (
    <div className="page">
      <div className="page-heading-row">
        <h1>{invoice.invoiceNumber}</h1>
        <button className="no-print" onClick={() => window.print()}>
          Print recon
        </button>
      </div>
      <p className="muted">
        {invoice.invoiceDate} — <span className={`status-pill status-${invoice.status}`}>{invoice.status}</span>
      </p>

      <div className="kpi-row">
        <div className="kpi-tile">
          <span className="kpi-label">Student charges</span>
          <span className="kpi-value">{formatRand(summary.studentCharges)}</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-label">Fee credits</span>
          <span className="kpi-value">{formatRand(summary.feeCredits)}</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-label">Invoice total</span>
          <span className="kpi-value">{formatRand(summary.invoiceTotal)}</span>
        </div>
        <div className="kpi-tile kpi-outstanding">
          <span className="kpi-label">Amount due</span>
          <span className="kpi-value">{formatRand(summary.amountDue)}</span>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      <div className="inline-form">
        <button onClick={markPaid} disabled={updating || invoice.status === "paid"}>
          Mark paid
        </button>
        <button onClick={markOutstanding} disabled={updating || invoice.status === "outstanding"}>
          Mark outstanding
        </button>
      </div>

      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Student no</th>
            <th>Name</th>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className={line.isFee ? "row-fee" : ""}>
              <td>{line.studentNumber ?? "—"}</td>
              <td>
                {line.studentSurname ? `${line.studentSurname} ${line.studentName}` : "—"}
              </td>
              <td>{line.description}</td>
              <td>{Number(line.quantity)}</td>
              <td>{formatRand(Number(line.unitAmount))}</td>
              <td>{formatRand(Number(line.lineTotal))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
