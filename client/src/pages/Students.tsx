import { useEffect, useState } from "react";
import { useInstitutions } from "../institutions/InstitutionContext";
import { api } from "../lib/api";
import { formatRand } from "../lib/format";

interface StudentBillingSummary {
  studentId: number;
  studentNumber: string;
  name: string;
  surname: string;
  residence: string | null;
  campus: string | null;
  totalBilled: number;
  totalOutstanding: number;
  overallStatusLabel: string;
}

export function Students() {
  const { selectedId } = useInstitutions();
  const [rows, setRows] = useState<StudentBillingSummary[]>([]);

  useEffect(() => {
    if (!selectedId) return;
    api.get<StudentBillingSummary[]>(`/reports/students?institutionId=${selectedId}`).then(setRows);
  }, [selectedId]);

  return (
    <div className="page">
      <h1>Student roster & cross-invoice summary</h1>
      <table className="data-table">
        <thead>
          <tr>
            <th>Student no</th>
            <th>Name</th>
            <th>Surname</th>
            <th>Residence</th>
            <th>Total billed</th>
            <th>Outstanding</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.studentId} className={s.totalOutstanding > 0 ? "row-outstanding" : ""}>
              <td>{s.studentNumber}</td>
              <td>{s.name}</td>
              <td>{s.surname}</td>
              <td>{s.residence ?? "—"}</td>
              <td>{formatRand(s.totalBilled)}</td>
              <td>{formatRand(s.totalOutstanding)}</td>
              <td>{s.overallStatusLabel}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No students yet — upload an invoice first.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
