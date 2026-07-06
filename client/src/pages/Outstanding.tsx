import { useEffect, useState } from "react";
import { useInstitutions } from "../institutions/InstitutionContext";
import { api } from "../lib/api";
import { formatRand } from "../lib/format";

interface OutstandingEntry {
  invoiceId: number;
  invoiceNumber: string;
  amount: number;
}

interface StudentOutstanding {
  studentId: number;
  studentNumber: string;
  name: string;
  surname: string;
  totalOutstanding: number;
  outstandingByInvoice: OutstandingEntry[];
}

export function Outstanding() {
  const { selectedId } = useInstitutions();
  const [rows, setRows] = useState<StudentOutstanding[]>([]);

  useEffect(() => {
    if (!selectedId) return;
    api.get<StudentOutstanding[]>(`/reports/outstanding?institutionId=${selectedId}`).then(setRows);
  }, [selectedId]);

  const grandTotal = rows.reduce((s, r) => s + r.totalOutstanding, 0);

  return (
    <div className="page">
      <div className="page-heading-row">
        <h1>Who owes what</h1>
        <button className="no-print" onClick={() => window.print()}>
          Print recon
        </button>
      </div>
      <p className="muted">
        {rows.length} student(s) outstanding — {formatRand(grandTotal)} total.
      </p>
      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Student no</th>
            <th>Name</th>
            <th>Surname</th>
            <th>Outstanding invoices</th>
            <th>Total owed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.studentId} className="row-outstanding">
              <td>{s.studentNumber}</td>
              <td>{s.name}</td>
              <td>{s.surname}</td>
              <td>
                {s.outstandingByInvoice
                  .map((o) => `${o.invoiceNumber}: ${formatRand(o.amount)}`)
                  .join(", ")}
              </td>
              <td>{formatRand(s.totalOutstanding)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                Nothing outstanding.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
