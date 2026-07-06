import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../lib/api";

type Channel = "email" | "sms" | "both";
type Step = "details" | "otp";

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
      navigate("/");
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
        <p className="muted">Start a free 7-day trial — no card required.</p>

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
              <input
                type="password"
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
            <p className="muted">
              Enter the 6-digit code we sent to {form.channel === "sms" ? form.cell : form.email}.
              It expires in 10 minutes.
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
      </div>
    </div>
  );
}
