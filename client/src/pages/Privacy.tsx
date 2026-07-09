import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";

export function Privacy() {
  return (
    <div className="page" style={{ maxWidth: 720, margin: "0 auto" }}>
      <Logo size={32} />
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: 9 July 2026</p>

      <p>
        STUAPS ("we", "our", "the app") is invoice reconciliation and management software for
        student accommodation providers. This page explains what data we collect through the app
        and website, and how it's used.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account &amp; business details</strong> — company name, contact name, email
          address, cell number, and province, provided when a provider registers.
        </li>
        <li>
          <strong>Staff accounts</strong> — usernames, email addresses, and hashed passwords for
          each staff member an admin adds. Passwords are hashed (bcrypt) and never stored or
          transmitted in plain text.
        </li>
        <li>
          <strong>Reconciliation data you upload</strong> — institution names, invoice CSVs,
          student numbers, names, and billing amounts, entered or uploaded by the provider to use
          the app's core features. This data belongs to the provider's business, not to us.
        </li>
        <li>
          <strong>Payroll data</strong> (Premium add-on only, if enabled) — employee names, ID
          numbers, job titles, salaries, and payslip line items entered by the provider.
        </li>
        <li>
          <strong>Gmail access</strong> (optional, if a provider connects it) — read-only access to
          search for statement emails from configured sender domains. OAuth tokens are encrypted
          at rest (AES-256-GCM) and used only to scan for and, with explicit admin approval,
          import statement attachments. We never read or send email on a provider's behalf beyond
          this.
        </li>
        <li>
          <strong>Payment information</strong> — subscription payments are processed by Paystack.
          We do not receive or store card numbers; we only receive payment status and subscription
          confirmations from Paystack.
        </li>
        <li>
          <strong>Session cookies</strong> — a single, essential cookie to keep you signed in.
          It's HTTP-only and not used for tracking or advertising.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Solely to operate the app: authenticating users, running the reconciliation and reporting
        features a provider uses, processing subscription billing, and providing support. We do
        not sell personal or business data to third parties, and we do not use it for advertising.
      </p>

      <h2>Who can see it</h2>
      <p>
        Data is isolated per tenant (accommodation provider) — one provider's staff, students, and
        invoices are never visible to another provider. STUAPS platform administrators can access
        account and billing data to provide support and keep the service running.
      </p>

      <h2>Data retention &amp; deletion</h2>
      <p>
        We retain account and reconciliation data for as long as an account is active. To request
        deletion of your account and associated data, contact us using the details below.
      </p>

      <h2>Third-party services we use</h2>
      <ul>
        <li>Neon (Postgres database hosting)</li>
        <li>Vercel (application hosting)</li>
        <li>Paystack (payment processing)</li>
        <li>SendGrid (transactional email — verification codes, notifications)</li>
        <li>Google (Gmail API — only if a provider explicitly connects their inbox)</li>
      </ul>
      <p>Each processes data only as needed to provide their respective service to us.</p>

      <h2>Contact</h2>
      <p>
        Questions about this policy or your data — email{" "}
        <a href="mailto:support@stuaps.com">support@stuaps.com</a>.
      </p>

      <p className="muted small">
        <Link to="/login">← Back to sign in</Link>
      </p>
    </div>
  );
}
