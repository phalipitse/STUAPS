import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";

export function ForgotUsername() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ message: string }>("/session/forgot-username", { email });
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Forgot your username?</h1>

        {message ? (
          <p className="success">{message}</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="muted">
              Enter the email on your account and we'll send your username to it.
            </p>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Send username"}
            </button>
          </form>
        )}

        <p className="muted small">
          <Link to="/forgot-password">Forgot password instead?</Link>
        </p>
        <p className="muted small">
          <Link to="/login">← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
