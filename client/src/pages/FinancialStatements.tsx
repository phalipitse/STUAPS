import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function FinancialStatements() {
  const { tenant } = useAuth();
  const unlocked = tenant?.addonStatus === "active";

  return (
    <div className="page">
      <h1>Financial statements</h1>
      {unlocked ? (
        <p className="muted">
          Premium is active for your account. Income statements, balance sheets and cash flow
          reports are on the way — this page will fill in as they ship.
        </p>
      ) : (
        <>
          <p className="muted">
            Income statements, balance sheets, and cash flow reports are part of the Premium
            add-on.
          </p>
          <Link to="/billing">Upgrade to Premium →</Link>
        </>
      )}
    </div>
  );
}
