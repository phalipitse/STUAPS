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
        <h1>Know exactly which students owe you — and get it in writing.</h1>
        <p className="landing-hero-sub">
          When NSFAS pays a student directly instead of paying you, the money
          doesn't stop being yours. STUAPS reconciles every funder invoice
          against your roster, shows you who still owes what, and prints a
          dated request-for-payment letter you can put in that student's hand.
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

      <section className="landing-section landing-section-alt">
        <h2>One recovered student pays for the year</h2>
        <p className="landing-section-sub">
          A student place runs around R4,600 a month. STUAPS starts at R750 a
          month — roughly 15% of what a single student pays you. Recover two
          months from one student and the year is covered; everything after
          that is money you weren't getting back.
        </p>
      </section>

      <section className="landing-section" id="features">
        <h2>Chase the money, not the paperwork</h2>
        <div className="landing-feature-grid">
          <div className="landing-feature-card">
            <h3>See who owes you, today</h3>
            <p>
              Upload the funder's invoice and STUAPS matches every line against
              your roster automatically. No spreadsheet, no guesswork — a live
              list of every student still short, and by how much.
            </p>
          </div>
          <div className="landing-feature-card">
            <h3>Put the request in writing</h3>
            <p>
              One click prints a dated, itemised request-for-payment letter for
              any student who owes you — their name, student number, and every
              outstanding invoice. Proof you asked, on the day you asked.
            </p>
          </div>
          <div className="landing-feature-card">
            <h3>Know your real numbers</h3>
            <p>
              Income statement, cash flow, and balance sheet built from your
              actual invoices and expenses — so when a funder or a bank asks
              what you're owed, you have the answer already.
            </p>
          </div>
          <div className="landing-feature-card">
            <h3>Run the rest of the business</h3>
            <p>
              Properties, staff payroll and payslips, and pest control due
              dates — the compliance and admin that comes with every residence,
              tracked in the same place.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-alt" id="pricing">
        <h2>You pay for the students you house</h2>
        <div className="landing-pricing-grid">
          <div className="landing-price-card">
            <span className="landing-price-label">Monthly</span>
            <span className="landing-price-value">R750</span>
            <span className="landing-price-period">
              per month — up to 50 students, then R2.50 per extra student
            </span>
          </div>
          <div className="landing-price-card landing-price-featured">
            <span className="landing-price-badge">Save 10%</span>
            <span className="landing-price-label">Annual</span>
            <span className="landing-price-value">R8,100</span>
            <span className="landing-price-period">
              per year — up to 50 students, then R2.50 per extra student
            </span>
          </div>
          <div className="landing-price-card">
            <span className="landing-price-label">Premium add-on</span>
            <span className="landing-price-value">R150–R200</span>
            <span className="landing-price-period">per month — payroll + financial statements</span>
          </div>
        </div>
        <p className="landing-pricing-note">
          No jump at 50 — a 60-student provider pays R775, a 100-student
          provider R875. Every plan starts with a 14-day free trial, no card
          required.
        </p>
      </section>

      <section className="landing-section" id="waitlist">
        <h2>Outside South Africa? Join the waitlist.</h2>
        <p className="landing-section-sub">
          STUAPS is live today for providers in South Africa, with expansion
          across Africa underway. Tell us where you're based and we'll reach
          out as soon as it's available for you.
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
