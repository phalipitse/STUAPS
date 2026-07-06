import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface TenantRow {
  id: number;
  companyName: string;
  contactEmail: string;
  subscriptionStatus: "trial" | "active" | "past_due" | "cancelled";
  trialEndsAt: string | null;
  institutionCount: number;
  invoiceCount: number;
}

export function Admin() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);

  async function refresh() {
    const rows = await api.get<TenantRow[]>("/admin/tenants");
    setTenants(rows);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function setStatus(id: number, subscriptionStatus: TenantRow["subscriptionStatus"]) {
    await api.patch(`/admin/tenants/${id}/subscription`, { subscriptionStatus });
    await refresh();
  }

  return (
    <div className="page">
      <h1>Super Admin — all tenants</h1>
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
  );
}
