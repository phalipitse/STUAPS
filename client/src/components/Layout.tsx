import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useInstitutions } from "../institutions/InstitutionContext";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diffMs = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function Layout() {
  const { user, tenant, logout } = useAuth();
  const { institutions, selectedId, setSelectedId } = useInstitutions();
  const navigate = useNavigate();

  const trialDaysLeft = tenant ? daysUntil(tenant.trialEndsAt) : null;

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      {tenant?.subscriptionStatus === "trial" && (
        <div className="trial-banner">
          Your account is in trial mode
          {trialDaysLeft !== null && trialDaysLeft >= 0 ? ` — ${trialDaysLeft} day(s) left` : ""}.{" "}
          <Link to="/billing">Subscribe now</Link> to keep access after your trial ends.
        </div>
      )}
      {(tenant?.subscriptionStatus === "past_due" || tenant?.subscriptionStatus === "cancelled") && (
        <div className="trial-banner trial-banner-urgent">
          {tenant.subscriptionStatus === "past_due"
            ? "Your last payment failed."
            : "Your subscription is cancelled."}{" "}
          <Link to="/billing">Fix billing</Link> to avoid losing access.
        </div>
      )}

      <header className="app-header">
        <div className="brand">Student Accommodation Recon</div>

        {institutions.length > 0 && (
          <select
            className="institution-select"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(Number(e.target.value))}
          >
            {institutions.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.invoicePrefix} — {inst.name}
              </option>
            ))}
          </select>
        )}

        <nav className="app-nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/invoices">Invoices</NavLink>
          <NavLink to="/students">Students</NavLink>
          <NavLink to="/outstanding">Outstanding</NavLink>
          <NavLink to="/institutions">Institutions</NavLink>
          <NavLink to="/properties">Properties</NavLink>
          {user?.role === "admin" && <NavLink to="/team">Team</NavLink>}
          {user?.role === "admin" && <NavLink to="/billing">Billing</NavLink>}
          {user?.isSuperAdmin && <NavLink to="/admin">Super Admin</NavLink>}
        </nav>

        <div className="user-menu">
          <span>{user?.username}</span>
          <button onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
