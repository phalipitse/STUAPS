import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";
import { PasswordInput } from "../components/PasswordInput";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function log(msg: string) {
    setDebugLog((prev) => [...prev, `${new Date().toISOString().slice(11, 23)} ${msg}`]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    log("submit clicked");
    setError(null);
    setSubmitting(true);
    try {
      log("calling login()");
      await login(username, password);
      log("login() resolved, navigating");
      navigate("/");
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? `ApiError(${err.status}): ${err.message}`
          : err instanceof Error
            ? `${err.name}: ${err.message}`
            : String(err);
      log(`caught error: ${detail}`);
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
      log("submitting=false");
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Student Accommodation Recon</h1>
        <p className="muted">Sign in with your username and password.</p>

        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <p className="muted small">
          <Link to="/forgot-password">Forgot username or password?</Link>
        </p>
        <p className="muted small">
          New accommodation provider? <Link to="/register">Register here →</Link>
        </p>

        {debugLog.length > 0 && (
          <pre
            style={{
              marginTop: "1rem",
              padding: "0.5rem",
              background: "#111",
              color: "#0f0",
              fontSize: "0.7rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              borderRadius: "6px",
              maxHeight: "220px",
              overflowY: "auto",
            }}
          >
            {debugLog.join("\n")}
          </pre>
        )}
      </form>
    </div>
  );
}
