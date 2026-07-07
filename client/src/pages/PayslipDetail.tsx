import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatRand } from "../lib/format";

interface PayslipResponse {
  payslip: { id: number; periodStart: string; grossSalary: string };
  employee: { name: string; idNumber: string; jobTitle: string | null } | null;
  lines: Array<{ id: number; type: "earning" | "deduction"; description: string; amount: string }>;
  summary: { grossSalary: number; totalEarnings: number; totalDeductions: number; netPay: number };
}

export function PayslipDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<PayslipResponse | null>(null);

  useEffect(() => {
    api.get<PayslipResponse>(`/payroll/payslips/${id}`).then(setData);
  }, [id]);

  async function remove() {
    if (!confirm("Delete this payslip?")) return;
    await api.delete(`/payroll/payslips/${id}`);
    navigate("/payroll");
  }

  if (!data) return <div className="page">Loading…</div>;

  const { payslip, employee, lines, summary } = data;

  return (
    <div className="page">
      <div className="page-heading-row">
        <h1>Payslip — {payslip.periodStart.slice(0, 7)}</h1>
        <div className="no-print">
          <button onClick={() => window.print()}>Print</button> <button onClick={remove}>Delete</button>
        </div>
      </div>

      {employee && (
        <p className="muted">
          {employee.name} ({employee.idNumber}){employee.jobTitle ? ` — ${employee.jobTitle}` : ""}
        </p>
      )}

      <div className="kpi-row">
        <div className="kpi-tile">
          <span className="kpi-label">Gross salary</span>
          <span className="kpi-value">{formatRand(summary.grossSalary)}</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-label">Total earnings</span>
          <span className="kpi-value">{formatRand(summary.totalEarnings)}</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-label">Total deductions</span>
          <span className="kpi-value">{formatRand(summary.totalDeductions)}</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-label">Net pay</span>
          <span className="kpi-value">{formatRand(summary.netPay)}</span>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className={l.type === "deduction" ? "row-fee" : ""}>
                <td>{l.type === "earning" ? "Earning" : "Deduction"}</td>
                <td>{l.description}</td>
                <td>{formatRand(Number(l.amount))}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No additional earnings or deductions on this payslip.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
