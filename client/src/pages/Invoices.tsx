import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useInstitutions } from "../institutions/InstitutionContext";
import { api, ApiError } from "../lib/api";
import { formatRand } from "../lib/format";

const NO_INSTITUTION_MESSAGE =
  "Add an institution first — an invoice needs to belong to one before you can upload it.";

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  total: string;
  amountPaid: string;
  status: "outstanding" | "paid" | "partial";
}

export function Invoices() {
  const { selectedId } = useInstitutions();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    if (!selectedId) return;
    const rows = await api.get<InvoiceRow[]>(`/invoices?institutionId=${selectedId}`);
    setInvoices(rows);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) {
      setError(NO_INSTITUTION_MESSAGE);
      return;
    }
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("institutionId", String(selectedId));
      form.append("file", file);
      await api.upload("/invoices/upload", form);
      setFile(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="page">
      <h1>Invoices</h1>

      {!selectedId && (
        <p className="error">
          {NO_INSTITUTION_MESSAGE} <Link to="/institutions">Add one here →</Link>
        </p>
      )}

      <form className="inline-form" onSubmit={handleUpload}>
        <label>
          Upload monthly invoice CSV
          <input
            type="file"
            accept=".csv"
            disabled={!selectedId}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={!file || uploading || !selectedId}>
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Invoice date</th>
            <th>Due date</th>
            <th>Total</th>
            <th>Paid</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} className={inv.status === "outstanding" ? "row-outstanding" : ""}>
              <td>{inv.invoiceNumber}</td>
              <td>{inv.invoiceDate}</td>
              <td>{inv.dueDate}</td>
              <td>{formatRand(Number(inv.total))}</td>
              <td>{formatRand(Number(inv.amountPaid))}</td>
              <td>
                <span className={`status-pill status-${inv.status}`}>{inv.status}</span>
              </td>
              <td>
                <Link to={`/invoices/${inv.id}`}>View</Link>
              </td>
            </tr>
          ))}
          {invoices.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
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
