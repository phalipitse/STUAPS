import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../lib/api";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function Billing() {
  const { tenant } = useAuth();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);

  const checkoutResult = searchParams.get("checkout");
  const trialDaysLeft = tenant ? daysUntil(tenant.trialEndsAt) : null;

  async function startCheckout() {
    setError(null);
    setLoading("checkout");
    try {
      const res = await api.post<{ url: string }>("/billing/checkout");
      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout");
      setLoading(null);
    }
  }

  async function openPortal() {
    setError(null);
    setLoading("portal");
    try {
      const res = await api.get<{ url: string }>("/billing/portal");
      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open billing portal");
      setLoading(null);
    }
  }

  return (
    <div className="page">
      <h1>Billing</h1>

      {checkoutResult === "success" && (
        <p className="muted">
          Payment received — it may take a few seconds for your account to update.
        </p>
      )}
      {checkoutResult === "cancelled" && <p className="muted">Checkout cancelled.</p>}

      <div className="kpi-row">
        <div className="kpi-tile">
          <span className="kpi-label">Plan</span>
          <span className="kpi-value">R750 / month</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-label">Status</span>
          <span className="kpi-value">
            <span className={`status-pill status-${tenant?.subscriptionStatus}`}>
              {tenant?.subscriptionStatus}
            </span>
          </span>
        </div>
        {tenant?.subscriptionStatus === "trial" && (
          <div className="kpi-tile">
            <span className="kpi-label">Trial ends</span>
            <span className="kpi-value">
              {trialDaysLeft !== null && trialDaysLeft >= 0 ? `${trialDaysLeft} day(s)` : "Ended"}
            </span>
          </div>
        )}
      </div>

      {(tenant?.subscriptionStatus === "trial" || tenant?.subscriptionStatus === "cancelled") && (
        <p className="muted">
          {tenant.subscriptionStatus === "trial"
            ? "Subscribe now to keep access after your trial ends."
            : "Your subscription is cancelled. Subscribe again to regain access."}
        </p>
      )}
      {tenant?.subscriptionStatus === "past_due" && (
        <p className="error">
          Your last payment failed. Update your payment method to avoid losing access.
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <div className="inline-form">
        {tenant?.subscriptionStatus !== "active" && (
          <button onClick={startCheckout} disabled={loading !== null}>
            {loading === "checkout" ? "Redirecting…" : "Upgrade now — R750/month"}
          </button>
        )}
        <button onClick={openPortal} disabled={loading !== null}>
          {loading === "portal" ? "Opening…" : "Manage billing"}
        </button>
      </div>
    </div>
  );
}
