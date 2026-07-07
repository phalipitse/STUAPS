import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../lib/api";
import { formatRand } from "../lib/format";

interface Employee {
  id: number;
  name: string;
  idNumber: string;
  jobTitle: string | null;
  startDate: string | null;
  monthlySalary: string;
  active: boolean;
}

interface Payslip {
  id: number;
  employeeId: number;
  periodStart: string;
  grossSalary: string;
}

interface LineDraft {
  type: "earning" | "deduction";
  description: string;
  amount: string;
}

function todayMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function Payroll() {
  const { tenant } = useAuth();
  const unlocked = tenant?.addonStatus === "active";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [addingEmployee, setAddingEmployee] = useState(false);

  const [payslipEmployeeId, setPayslipEmployeeId] = useState<number | null>(null);
  const [period, setPeriod] = useState(todayMonth());
  const [grossSalary, setGrossSalary] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [generating, setGenerating] = useState(false);

  async function refresh() {
    const [employeeRows, payslipRows] = await Promise.all([
      api.get<Employee[]>("/payroll/employees"),
      api.get<Payslip[]>("/payroll/payslips"),
    ]);
    setEmployees(employeeRows);
    setPayslips(payslipRows);
  }

  useEffect(() => {
    if (!unlocked) return;
    refresh().catch(() => {});
  }, [unlocked]);

  async function addEmployee(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAddingEmployee(true);
    try {
      await api.post("/payroll/employees", {
        name,
        idNumber,
        jobTitle: jobTitle || undefined,
        startDate: startDate || undefined,
        monthlySalary: Number(monthlySalary),
      });
      setName("");
      setIdNumber("");
      setJobTitle("");
      setStartDate("");
      setMonthlySalary("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add employee");
    } finally {
      setAddingEmployee(false);
    }
  }

  async function deactivateEmployee(id: number) {
    await api.patch(`/payroll/employees/${id}`, { active: false });
    await refresh();
  }

  function selectEmployeeForPayslip(emp: Employee) {
    setPayslipEmployeeId(emp.id);
    setGrossSalary(emp.monthlySalary);
    setLines([]);
  }

  function addLine(type: "earning" | "deduction") {
    setLines((cur) => [...cur, { type, description: "", amount: "" }]);
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((cur) => cur.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeLine(index: number) {
    setLines((cur) => cur.filter((_, i) => i !== index));
  }

  async function generatePayslip(e: FormEvent) {
    e.preventDefault();
    if (!payslipEmployeeId) return;
    setError(null);
    setGenerating(true);
    try {
      const res = await api.post<{ id: number }>("/payroll/payslips", {
        employeeId: payslipEmployeeId,
        periodStart: `${period}-01`,
        grossSalary: Number(grossSalary),
        lines: lines
          .filter((l) => l.description && l.amount)
          .map((l) => ({ type: l.type, description: l.description, amount: Number(l.amount) })),
      });
      window.location.href = `/payroll/payslips/${res.id}`;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate payslip");
      setGenerating(false);
    }
  }

  if (!unlocked) {
    return (
      <div className="page">
        <h1>Payroll</h1>
        <p className="muted">Payroll and payslip tools are part of the Premium add-on.</p>
        <Link to="/billing">Upgrade to Premium →</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Payroll</h1>
      <p className="muted">
        Generates gross-to-net payslips from line items you enter — there's no built-in PAYE/UIF
        calculator, so add tax and other deductions yourself each payslip.
      </p>

      <h2>Employees</h2>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>ID number</th>
              <th>Job title</th>
              <th>Start date</th>
              <th>Monthly salary</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className={emp.active ? "" : "row-fee"}>
                <td>{emp.name}</td>
                <td>{emp.idNumber}</td>
                <td>{emp.jobTitle ?? "—"}</td>
                <td>{emp.startDate ?? "—"}</td>
                <td>{formatRand(Number(emp.monthlySalary))}</td>
                <td>{emp.active ? "Active" : "Inactive"}</td>
                <td>
                  <button onClick={() => selectEmployeeForPayslip(emp)}>Generate payslip</button>{" "}
                  {emp.active && (
                    <button className="link-button" onClick={() => deactivateEmployee(emp.id)}>
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No employees yet — add one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h3>Add employee</h3>
      <form className="inline-form" onSubmit={addEmployee}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          ID number
          <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} required />
        </label>
        <label>
          Job title
          <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </label>
        <label>
          Start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          Monthly salary
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={monthlySalary}
            onChange={(e) => setMonthlySalary(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={addingEmployee}>
          {addingEmployee ? "Adding…" : "Add employee"}
        </button>
      </form>

      {payslipEmployeeId !== null && (
        <>
          <h2>Generate payslip — {employees.find((e) => e.id === payslipEmployeeId)?.name}</h2>
          <form className="inline-form" onSubmit={generatePayslip}>
            <label>
              Period
              <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />
            </label>
            <label>
              Gross salary
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={grossSalary}
                onChange={(e) => setGrossSalary(e.target.value)}
                required
              />
            </label>
          </form>

          {lines.map((line, i) => (
            <div className="inline-form" key={i}>
              <label>
                Type
                <select value={line.type} onChange={(e) => updateLine(i, { type: e.target.value as "earning" | "deduction" })}>
                  <option value="earning">Earning</option>
                  <option value="deduction">Deduction</option>
                </select>
              </label>
              <label>
                Description
                <input
                  value={line.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                  placeholder="PAYE, UIF, Overtime, Bonus…"
                />
              </label>
              <label>
                Amount
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={line.amount}
                  onChange={(e) => updateLine(i, { amount: e.target.value })}
                />
              </label>
              <button type="button" className="link-button" onClick={() => removeLine(i)}>
                Remove
              </button>
            </div>
          ))}

          <div className="inline-form">
            <button type="button" onClick={() => addLine("earning")}>
              + Add earning
            </button>
            <button type="button" onClick={() => addLine("deduction")}>
              + Add deduction
            </button>
            <button type="button" onClick={() => setPayslipEmployeeId(null)}>
              Cancel
            </button>
            <button onClick={generatePayslip} disabled={generating}>
              {generating ? "Generating…" : "Generate payslip"}
            </button>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}

      <h2>Payslips</h2>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Employee</th>
              <th>Gross salary</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payslips.map((p) => (
              <tr key={p.id}>
                <td>{p.periodStart.slice(0, 7)}</td>
                <td>{employees.find((e) => e.id === p.employeeId)?.name ?? "—"}</td>
                <td>{formatRand(Number(p.grossSalary))}</td>
                <td>
                  <Link to={`/payroll/payslips/${p.id}`}>View</Link>
                </td>
              </tr>
            ))}
            {payslips.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No payslips generated yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
