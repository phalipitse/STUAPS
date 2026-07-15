import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

interface TenantRow {
  id: number;
  companyName: string;
  contactEmail: string;
  subscriptionStatus: "trial" | "active" | "past_due" | "cancelled";
  trialEndsAt: string | null;
  institutionCount: number;
  invoiceCount: number;
}

interface WaitlistRow {
  id: number;
  fullName: string;
  email: string;
  companyName: string | null;
  country: string | null;
  propertyCount: string | null;
  createdAt: string;
}

export function Admin() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [tenantRows, waitlistRows] = await Promise.all([
      api.get<TenantRow[]>("/admin/tenants"),
      api.get<WaitlistRow[]>("/admin/waitlist"),
    ]);
    setTenants(tenantRows);
    setWaitlist(waitlistRows);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function setStatus(id: number, subscriptionStatus: TenantRow["subscriptionStatus"]) {
    setError(null);
    try {
      await api.patch(`/admin/tenants/${id}/subscription`, { subscriptionStatus });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update subscription status");
    }
  }

  return (
    <div className="page">
      <h1>Super Admin — all tenants</h1>
      {error && <p className="error">{error}</p>}
      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Company</th>
            <th>Contact email</th>
            <th>Subscription</th>
            <th>Trial ends</th>
            <th>Institutions</th>
            <th>Invoices</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.id}>
              <td>{t.companyName}</td>
              <td>{t.contactEmail}</td>
              <td>
                <span className={`status-pill status-${t.subscriptionStatus}`}>
                  {t.subscriptionStatus}
                </span>
              </td>
              <td>{t.trialEndsAt ? new Date(t.trialEndsAt).toLocaleDateString() : "—"}</td>
              <td>{t.institutionCount}</td>
              <td>{t.invoiceCount}</td>
              <td>
                <select
                  value={t.subscriptionStatus}
                  onChange={(e) => setStatus(t.id, e.target.value as TenantRow["subscriptionStatus"])}
                >
                  <option value="trial">trial</option>
                  <option value="active">active</option>
                  <option value="past_due">past_due</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </td>
            </tr>
          ))}
          {tenants.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No provider tenants yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      <h2>Waitlist signups</h2>
      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Company</th>
            <th>Country</th>
            <th>Properties</th>
            <th>Joined</th>
          </tr>
        </thead>
        <tbody>
          {waitlist.map((w) => (
            <tr key={w.id}>
              <td>{w.fullName}</td>
              <td>{w.email}</td>
              <td>{w.companyName ?? "—"}</td>
              <td>{w.country ?? "—"}</td>
              <td>{w.propertyCount ?? "—"}</td>
              <td>{new Date(w.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
          {waitlist.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No waitlist signups yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
