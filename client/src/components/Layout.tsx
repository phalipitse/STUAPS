import { useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useInstitutions } from "../institutions/InstitutionContext";
import { isLocked, trialDaysLeft } from "../lib/subscription";

export function Layout() {
  const { user, tenant, logout } = useAuth();
  const { institutions, selectedId, setSelectedId } = useInstitutions();
  const navigate = useNavigate();
  const location = useLocation();

  const daysLeft = trialDaysLeft(tenant);
  const locked = isLocked(tenant);

  useEffect(() => {
    if (locked && location.pathname !== "/billing") {
      navigate("/billing", { replace: true });
    }
  }, [locked, location.pathname, navigate]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      {!locked && tenant?.subscriptionStatus === "trial" && (
        <div className="trial-banner">
          Your account is in trial mode
          {daysLeft !== null && daysLeft >= 0 ? ` — ${daysLeft} day(s) left` : ""}.{" "}
          <NavLink to="/billing">Subscribe now</NavLink> to keep access after your trial ends.
        </div>
      )}

      <header className="app-header">
        <div className="brand">Student Accommodation Recon</div>

        {!locked && institutions.length > 0 && (
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

        {!locked && (
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
        )}

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
