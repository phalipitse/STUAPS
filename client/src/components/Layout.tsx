import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useInstitutions } from "../institutions/InstitutionContext";
import { isLocked, trialDaysLeft } from "../lib/subscription";
import { HomeIcon, InvoiceIcon, AlertIcon, InboxIcon, MenuIcon } from "./icons";

export function Layout() {
  const { user, tenant, logout } = useAuth();
  const { institutions, selectedId, setSelectedId } = useInstitutions();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const daysLeft = trialDaysLeft(tenant);
  const locked = isLocked(tenant);

  useEffect(() => {
    if (locked && location.pathname !== "/billing") {
      navigate("/billing", { replace: true });
    }
  }, [locked, location.pathname, navigate]);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

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

        {!locked && (
          <div className="institution-picker-group">
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
            {tenant && <div className="client-name">{tenant.companyName}</div>}
          </div>
        )}

        {!locked && (
          <nav className="app-nav app-nav-desktop">
            <NavLink to="/" end>
              Dashboard
            </NavLink>
            <NavLink to="/invoices">Invoices</NavLink>
            <NavLink to="/students">Students</NavLink>
            <NavLink to="/outstanding">Outstanding</NavLink>
            <NavLink to="/email-inbox">Email inbox</NavLink>
            <NavLink to="/institutions">Institutions</NavLink>
            <NavLink to="/properties">Properties</NavLink>
            {user?.role === "admin" && <NavLink to="/team">Team</NavLink>}
            {user?.role === "admin" && <NavLink to="/financial-statements">Financial statements</NavLink>}
            {user?.role === "admin" && <NavLink to="/payroll">Payroll</NavLink>}
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

      {!locked && (
        <>
          <nav className="bottom-nav">
            <NavLink to="/" end className="bottom-nav-item">
              <HomeIcon />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/invoices" className="bottom-nav-item">
              <InvoiceIcon />
              <span>Invoices</span>
            </NavLink>
            <NavLink to="/outstanding" className="bottom-nav-item">
              <AlertIcon />
              <span>Owing</span>
            </NavLink>
            <NavLink to="/email-inbox" className="bottom-nav-item">
              <InboxIcon />
              <span>Inbox</span>
            </NavLink>
            <button
              type="button"
              className={`bottom-nav-item${moreOpen ? " bottom-nav-item-active" : ""}`}
              onClick={() => setMoreOpen((v) => !v)}
            >
              <MenuIcon />
              <span>More</span>
            </button>
          </nav>

          {moreOpen && (
            <div className="bottom-nav-sheet-backdrop" onClick={() => setMoreOpen(false)}>
              <div className="bottom-nav-sheet" onClick={(e) => e.stopPropagation()}>
                <NavLink to="/students">Students</NavLink>
                <NavLink to="/institutions">Institutions</NavLink>
                <NavLink to="/properties">Properties</NavLink>
                {user?.role === "admin" && <NavLink to="/team">Team</NavLink>}
                {user?.role === "admin" && (
                  <NavLink to="/financial-statements">Financial statements</NavLink>
                )}
                {user?.role === "admin" && <NavLink to="/payroll">Payroll</NavLink>}
                {user?.role === "admin" && <NavLink to="/billing">Billing</NavLink>}
                {user?.isSuperAdmin && <NavLink to="/admin">Super Admin</NavLink>}
                <button className="link-button" onClick={handleLogout}>
                  Sign out ({user?.username})
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
