import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { PasswordInput } from "../components/PasswordInput";

type Step = "request" | "reset" | "done";

export function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("request");
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ resetToken: string; message: string }>(
        "/session/forgot-password/start",
        { usernameOrEmail }
      );
      setResetToken(res.resetToken);
      setMessage(res.message);
      setStep("reset");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/session/forgot-password/verify", { resetToken, code, newPassword });
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Reset your password</h1>

        {step === "request" && (
          <form onSubmit={handleRequest}>
            <p className="muted">
              Enter your username or the email on your account and we'll send you a
              verification code.
            </p>
            <label>
              Username or email
              <input
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Send verification code"}
            </button>
          </form>
        )}

        {step === "reset" && (
          <form onSubmit={handleReset}>
            <p className="success">Please check your email for the verification code.</p>
            {message && <p className="muted">{message}</p>}
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
            <label>
              New password
              <PasswordInput
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? "Resetting…" : "Reset password"}
            </button>
          </form>
        )}

        {step === "done" && (
          <div>
            <p>Your password has been reset.</p>
            <button onClick={() => navigate("/login")}>Go to sign in</button>
          </div>
        )}

        <p className="muted small">
          <Link to="/login">← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
