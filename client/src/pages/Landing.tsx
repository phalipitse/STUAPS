import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { api, ApiError } from "../lib/api";

const SA_PROVINCES_OR_COUNTRIES = [
  "South Africa",
  "Kenya",
  "Nigeria",
  "Ghana",
  "Botswana",
  "Namibia",
  "Other",
];

export function Landing() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [country, setCountry] = useState("South Africa");
  const [propertyCount, setPropertyCount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleWaitlistSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/waitlist", {
        fullName,
        email,
        companyName: companyName || undefined,
        country: country || undefined,
        propertyCount: propertyCount || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not join the waitlist — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo size={30} />
        <nav className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#waitlist">Waitlist</a>
          <Link to="/login" className="landing-nav-signin">
            Sign in
          </Link>
          <Link to="/register" className="landing-nav-register">
            Register
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <h1>
          Stop reconciling student invoices by hand.
        </h1>
        <p className="landing-hero-sub">
          STUAPS is a student accommodation management package that
          reconciles funder invoices against your student roster
          automatically, so you always know exactly who owes what — plus
          properties, payroll, and financial reporting in one place.
        </p>
        <div className="landing-hero-cta">
          <Link to="/register" className="landing-btn landing-btn-primary">
            Start your free 14-day trial
          </Link>
          <a href="#waitlist" className="landing-btn landing-btn-secondary">
            Join the waitlist
          </a>
        </div>
        <p className="landing-hero-note">No card required to start.</p>
      </section>

      <section className="landing-section" id="features">
        <h2>Everything reconciliation touches, in one package</h2>
        <div className="landing-feature-grid">
          <div className="landing-feature-card">
            <h3>Invoice reconciliation</h3>
            <p>
              Upload a funder's invoice CSV and STUAPS matches it against
              your live student roster automatically — outstanding, partial,
              and paid, tracked per invoice.
            </p>
          </div>
          <div className="landing-feature-card">
            <h3>Students &amp; properties</h3>
            <p>
              A single roster across every institution and residence, with a
              live "who owes what" report you can hand to anyone on your
              team.
            </p>
          </div>
          <div className="landing-feature-card">
            <h3>Payroll &amp; financial statements</h3>
            <p>
              Gross-to-net payslips, income statements, cash flow and
              balance sheet — computed straight from your real invoice and
              expense data.
            </p>
          </div>
          <div className="landing-feature-card">
            <h3>Install it like an app</h3>
            <p>
              Available on Google Play and Huawei AppGallery, or install
              straight from the browser — no separate mobile app to keep in
              sync.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-alt" id="pricing">
        <h2>Simple, self-serve pricing</h2>
        <div className="landing-pricing-grid">
          <div className="landing-price-card">
            <span className="landing-price-label">Monthly</span>
            <span className="landing-price-value">R750</span>
            <span className="landing-price-period">per month</span>
          </div>
          <div className="landing-price-card landing-price-featured">
            <span className="landing-price-badge">Save 10%</span>
            <span className="landing-price-label">Annual</span>
            <span className="landing-price-value">R8,100</span>
            <span className="landing-price-period">per year</span>
          </div>
          <div className="landing-price-card">
            <span className="landing-price-label">Premium add-on</span>
            <span className="landing-price-value">R150–R200</span>
            <span className="landing-price-period">per month — payroll + financial statements</span>
          </div>
        </div>
        <p className="landing-pricing-note">
          Every plan starts with a 14-day free trial. No card required.
        </p>
      </section>

      <section className="landing-section" id="waitlist">
        <h2>Not ready yet? Join the waitlist.</h2>
        <p className="landing-section-sub">
          STUAPS is live today for providers in South Africa, with
          expansion across Africa underway. Tell us where you're based and
          we'll reach out as soon as it's available for you.
        </p>

        {submitted ? (
          <p className="success landing-waitlist-success">
            You're on the list — thanks. We'll be in touch.
          </p>
        ) : (
          <form className="landing-waitlist-form" onSubmit={handleWaitlistSubmit}>
            <label>
              Full name
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </label>
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Company name
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </label>
            <label>
              Country
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                {SA_PROVINCES_OR_COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Number of properties
              <input
                value={propertyCount}
                onChange={(e) => setPropertyCount(e.target.value)}
                placeholder="e.g. 1-5"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? "Joining…" : "Join the waitlist"}
            </button>
          </form>
        )}
      </section>

      <footer className="landing-footer">
        <Logo size={22} />
        <p className="landing-footer-fine">
          A product of ZaniQ Holdings. <Link to="/privacy">Privacy policy</Link>
        </p>
      </footer>
    </div>
  );
}
