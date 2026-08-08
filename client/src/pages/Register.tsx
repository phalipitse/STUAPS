import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../lib/api";
import { PasswordInput } from "../components/PasswordInput";

type Channel = "email" | "sms" | "both";
type Step = "details" | "otp";
type PlanChoice = "trial" | "monthly" | "annual";

const MONTHLY_PRICE = 750;
const ANNUAL_PRICE = Math.round(MONTHLY_PRICE * 12 * 0.9); // 12 x R750, less 10% = R8,100

function formatRand(amount: number) {
  return `R${amount.toLocaleString("en-ZA")}`;
}

export function Register() {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("details");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    cell: "",
    province: "",
    channel: "email" as Channel,
    username: "",
    password: "",
  });
  const [plan, setPlan] = useState<PlanChoice>("trial");
  const [registrationToken, setRegistrationToken] = useState("");
  const [code, setCode] = useState("");

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleStart(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ registrationToken: string }>("/register/start", form);
      setRegistrationToken(res.registrationToken);
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start registration");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{
        user: Parameters<typeof setSession>[0];
        tenant: Parameters<typeof setSession>[1];
      }>("/register/verify", { registrationToken, code });
      setSession(res.user, res.tenant);
      // Every account still starts on the 14-day free trial (no card collected
      // here) — picking a paid plan just carries that choice into Billing so
      // checkout is pre-selected instead of making them pick again.
      navigate(plan === "trial" ? "/" : `/billing?plan=${plan}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Register your business</h1>
        <p className="muted">Start a free 14-day trial — no card required.</p>

        {step === "details" && (
          <form onSubmit={handleStart}>
            <label>
              Company name
              <input
                value={form.companyName}
                onChange={(e) => update("companyName", e.target.value)}
                required
              />
            </label>
            <label>
              Contact full name
              <input
                value={form.contactName}
                onChange={(e) => update("contactName", e.target.value)}
                required
              />
            </label>
            <label>
              Email address
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                required
              />
            </label>
            <label>
              Cell number
              <input value={form.cell} onChange={(e) => update("cell", e.target.value)} />
            </label>
            <label>
              Province
              <input value={form.province} onChange={(e) => update("province", e.target.value)} />
            </label>

            <p className="muted small" style={{ marginBottom: 4 }}>
              Choose a plan — you can always change this later from Billing.
            </p>
            <div className="plan-row">
              <button
                type="button"
                className={`plan-card${plan === "trial" ? " plan-card-selected" : ""}`}
                onClick={() => setPlan("trial")}
              >
                <span className="plan-name">Free trial</span>
                <span className="plan-price">14 days</span>
                <span className="plan-period">no card required</span>
              </button>
              <button
                type="button"
                className={`plan-card${plan === "monthly" ? " plan-card-selected" : ""}`}
                onClick={() => setPlan("monthly")}
              >
                <span className="plan-name">Monthly</span>
                <span className="plan-price">{formatRand(MONTHLY_PRICE)}</span>
                <span className="plan-period">per month</span>
              </button>
              <button
                type="button"
                className={`plan-card${plan === "annual" ? " plan-card-selected" : ""}`}
                onClick={() => setPlan("annual")}
              >
                <span className="plan-badge">Save 10%</span>
                <span className="plan-name">Annual</span>
                <span className="plan-price">{formatRand(ANNUAL_PRICE)}</span>
                <span className="plan-period">per year</span>
              </button>
            </div>

            <label>
              Send verification code via
              <select value={form.channel} onChange={(e) => update("channel", e.target.value as Channel)}>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="both">Both</option>
              </select>
            </label>
            <label>
              Choose a username
              <input value={form.username} onChange={(e) => update("username", e.target.value)} required />
            </label>
            <label>
              Choose a password
              <PasswordInput
                minLength={8}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                required
              />
            </label>

            {error && <p className="error">{error}</p>}

            <button type="submit" disabled={submitting}>
              {submitting ? "Sending code…" : "Send verification code"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerify}>
            <p className="success">
              {form.channel === "sms"
                ? "Please check your phone for the verification code."
                : form.channel === "both"
                  ? "Please check your email and phone for the verification code."
                  : "Please check your email for the verification code."}
            </p>
            <p className="muted">
              Sent to {form.channel === "sms" ? form.cell : form.email}. It expires in 10 minutes.
            </p>
            <label>
              Verification code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                inputMode="numeric"
                required
              />
            </label>

            {error && <p className="error">{error}</p>}

            <button type="submit" disabled={submitting}>
              {submitting ? "Verifying…" : "Verify & create account"}
            </button>
            <button type="button" className="link-button" onClick={() => setStep("details")}>
              ← Back
            </button>
          </form>
        )}

        <p className="muted small">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
        <p className="muted small">
          By registering you agree to our <Link to="/privacy">privacy policy</Link>.
        </p>
      </div>
    </div>
  );
}
