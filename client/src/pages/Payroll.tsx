import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Payroll() {
  const { tenant } = useAuth();
  const unlocked = tenant?.addonStatus === "active";

  return (
    <div className="page">
      <h1>Payroll</h1>
      {unlocked ? (
        <p className="muted">
          Premium is active for your account. Salary, UIF/PAYE and payslip tools are on the way —
          this page will fill in as they ship.
        </p>
      ) : (
        <>
          <p className="muted">Payroll and tax tools are part of the Premium add-on.</p>
          <Link to="/billing">Upgrade to Premium →</Link>
        </>
      )}
    </div>
  );
}
