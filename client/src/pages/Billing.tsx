import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../lib/api";
import { isLocked, trialDaysLeft } from "../lib/subscription";

type Plan = "monthly" | "annual";

const MONTHLY_PRICE = 750;
const ANNUAL_PRICE = Math.round(MONTHLY_PRICE * 12 * 0.9); // 12 x R750, less 10% = R8,100

function formatRand(amount: number) {
  return `R${amount.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface UsageCharge {
  id: number;
  periodStart: string;
  activeStudents: number;
  billableExtraStudents: number;
  amountRand: string;
  status: string;
}

interface Usage {
  plan: Plan;
  activeStudents: number;
  includedStudents: number;
  billableExtraStudents: number;
  baseRand: number;
  overageRand: number;
  totalRand: number;
  overageRatePerStudent: number;
  activeWindowDays: number;
  history: UsageCharge[];
}

export function Billing() {
  const { tenant } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [plan, setPlan] = useState<Plan>("monthly");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"checkout" | "portal" | "addon" | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<{ status: string; kind: string | null } | null>(
    null
  );
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    api.get<Usage>("/billing/usage").then(setUsage).catch(() => setUsage(null));
  }, []);

  const daysLeft = trialDaysLeft(tenant);
  const locked = isLocked(tenant) && paymentNotice?.status !== "success";
  const addonMonthlyPrice = tenant?.billingPlan === "annual" ? 150 : 200;

  useEffect(() => {
    // Paystack redirects back here with its own `reference` — the redirect alone
    // doesn't reliably distinguish success/failure, so we verify it directly
    // rather than trusting a success/cancelled flag we set ourselves.
    const reference = searchParams.get("reference");
    if (!reference) return;
    api
      .get<{ status: string; kind: string | null }>(
        `/billing/verify?reference=${encodeURIComponent(reference)}`
      )
      .then(setPaymentNotice)
      .finally(() => setSearchParams({}, { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Carries the plan picked at registration through to checkout, so the
    // right card is pre-selected instead of making them choose again.
    const requestedPlan = searchParams.get("plan");
    if (requestedPlan === "monthly" || requestedPlan === "annual") {
      setPlan(requestedPlan);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCheckout() {
    setError(null);
    setLoading("checkout");
    try {
      const res = await api.post<{ url: string }>("/billing/checkout", { plan });
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

  async function startAddonCheckout() {
    setError(null);
    setLoading("addon");
    try {
      const res = await api.post<{ url: string }>("/billing/addon/checkout");
      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout");
      setLoading(null);
    }
  }

  const needsToSubscribe = tenant?.subscriptionStatus !== "active";

  return (
    <div className="page">
      {locked ? (
        <h1 className="lock-heading">Make a payment to continue with STUAPS.</h1>
      ) : (
        <h1>Billing</h1>
      )}

      {paymentNotice && (
        <p className={paymentNotice.status === "success" ? "muted" : "error"}>
          {paymentNotice.status === "success"
            ? paymentNotice.kind === "addon"
              ? "Premium add-on activated — it may take a few seconds for your account to update."
              : "Payment received — it may take a few seconds for your account to update."
            : `Payment ${paymentNotice.status}. If you were charged, contact support — otherwise you can try again below.`}
        </p>
      )}

      {!locked && (
        <div className="kpi-row">
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
                {daysLeft !== null && daysLeft >= 0 ? `${daysLeft} day(s)` : "Ended"}
              </span>
            </div>
          )}
        </div>
      )}

      {!locked && (tenant?.subscriptionStatus === "trial" || tenant?.subscriptionStatus === "cancelled") && (
        <p className="muted">
          {tenant.subscriptionStatus === "trial"
            ? "Subscribe now to keep access after your trial ends."
            : "Your subscription is cancelled. Subscribe again to regain access."}
        </p>
      )}
      {!locked && tenant?.subscriptionStatus === "past_due" && (
        <p className="error">
          Your last payment failed. Update your payment method to avoid losing access.
        </p>
      )}

      {needsToSubscribe && (
        <div className="plan-row">
          <button
            type="button"
            className={`plan-card${plan === "monthly" ? " plan-card-selected" : ""}`}
            onClick={() => setPlan("monthly")}
          >
            <span className="plan-name">Monthly</span>
            <span className="plan-price">{formatRand(MONTHLY_PRICE)}</span>
            <span className="plan-period">per month — up to 50 students</span>
          </button>
          <button
            type="button"
            className={`plan-card${plan === "annual" ? " plan-card-selected" : ""}`}
            onClick={() => setPlan("annual")}
          >
            <span className="plan-badge">Save 10%</span>
            <span className="plan-name">Annual</span>
            <span className="plan-price">{formatRand(ANNUAL_PRICE)}</span>
            <span className="plan-period">
              per year — up to 50 students
            </span>
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="inline-form">
        {needsToSubscribe && (
          <button onClick={startCheckout} disabled={loading !== null}>
            {loading === "checkout"
              ? "Redirecting…"
              : `Upgrade now — ${plan === "monthly" ? formatRand(MONTHLY_PRICE) + "/month" : formatRand(ANNUAL_PRICE) + "/year"}`}
          </button>
        )}
        {(!locked || tenant?.subscriptionStatus === "past_due") && (
          <button onClick={openPortal} disabled={loading !== null}>
            {loading === "portal" ? "Opening…" : "Manage billing"}
          </button>
        )}
      </div>

      {!locked && usage && (
        <>
          <h2>Your usage</h2>
          <div className="kpi-row">
            <div className="kpi-tile">
              <span className="kpi-label">Students billed</span>
              <span className="kpi-value">{usage.activeStudents}</span>
            </div>
            <div className="kpi-tile">
              <span className="kpi-label">Included</span>
              <span className="kpi-value">{usage.includedStudents}</span>
            </div>
            <div className="kpi-tile">
              <span className="kpi-label">Above allowance</span>
              <span className="kpi-value">{usage.billableExtraStudents}</span>
            </div>
            <div className={usage.overageRand > 0 ? "kpi-tile kpi-outstanding" : "kpi-tile"}>
              <span className="kpi-label">
                Next {usage.plan === "annual" ? "yearly" : "monthly"} bill
              </span>
              <span className="kpi-value">{formatRand(usage.totalRand)}</span>
            </div>
          </div>
          <p className="muted small">
            Counted from students you've invoiced in the last {usage.activeWindowDays} days — not
            your whole roster, so students who have left stop counting.{" "}
            {usage.billableExtraStudents > 0
              ? `${formatRand(usage.baseRand)} base + ${usage.billableExtraStudents} × ${formatRand(
                  usage.overageRatePerStudent
                )} = ${formatRand(usage.totalRand)}.`
              : `The first ${usage.includedStudents} are included in your ${formatRand(
                  usage.baseRand
                )} plan.`}
          </p>

          {usage.history.length > 0 && (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Students</th>
                    <th>Above allowance</th>
                    <th>Extra charged</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.history.map((h) => (
                    <tr key={h.id}>
                      <td>{h.periodStart}</td>
                      <td>{h.activeStudents}</td>
                      <td>{h.billableExtraStudents}</td>
                      <td>{formatRand(Number(h.amountRand))}</td>
                      <td>
                        <span
                          className={`status-pill status-${h.status === "success" ? "paid" : "outstanding"}`}
                        >
                          {h.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!locked && (
        <>
          <h2>Premium: financial statements &amp; payroll</h2>
          <p className="muted">
            Unlock income statements, balance sheets, cash flow, and payroll/tax tools for an extra{" "}
            {formatRand(addonMonthlyPrice)}/month on top of your {tenant?.billingPlan ?? "monthly"} plan.
          </p>
          {tenant?.addonStatus === "active" ? (
            <p>
              <span className="status-pill status-approved">Premium active</span> — manage or cancel it
              from "Manage billing" above.
            </p>
          ) : (
            <div className="inline-form">
              <button onClick={startAddonCheckout} disabled={loading !== null}>
                {loading === "addon" ? "Redirecting…" : `Add Premium — ${formatRand(addonMonthlyPrice)}/month`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
