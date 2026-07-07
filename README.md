# Student Accommodation Recon

A multi-tenant web app that automates the monthly student-accommodation invoice
reconciliation described in `invoice-recon-app-prompt.md`. This replaces the manual
Excel workbook: upload a monthly invoice CSV, and it parses per-student charges vs.
fee deductions, tracks payment status per invoice, and rolls everything up into a
cross-invoice "who owes what" report.

## Stack

- **server/** — Express + TypeScript API, Drizzle ORM, Postgres, session-based auth
- **client/** — React + Vite + TypeScript SPA

## Local setup

1. Start Postgres and create a dev database:
   ```bash
   sudo service postgresql start
   sudo -u postgres psql -c "CREATE USER app WITH PASSWORD 'app' SUPERUSER;"
   sudo -u postgres psql -c "CREATE DATABASE recon_dev OWNER app;"
   ```
2. Install dependencies and copy the env file:
   ```bash
   npm install
   cp server/.env.example server/.env
   ```
3. Run migrations and seed the super-admin (Pits Marketing) account:
   ```bash
   npm run db:migrate
   npm run --workspace server seed
   ```
4. Start both apps:
   ```bash
   npm run dev:server   # http://localhost:4000
   npm run dev:client   # http://localhost:5173
   ```

The super-admin username/password default to `pitsadmin` / `change-me-in-production`
(see `server/.env.example` — override `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD`
before running `seed` in anything beyond local dev).

## Deploying to Vercel

The app deploys as a single Vercel project: the client builds to static assets,
and `api/[...all].ts` wraps the whole Express app as one serverless function
(same-origin, so no CORS/env-var juggling between front and back end).

1. You need a Postgres database reachable from the internet — Vercel's sandboxed
   local Postgres isn't reachable from a deployment. [Neon](https://neon.tech) has
   a free tier and is what Vercel's own "Storage" tab offers. Use the **pooled**
   connection string (Neon's `-pooler` host) — serverless functions open a lot of
   short-lived connections, and the pooled endpoint is built for that.
2. In the Vercel project settings, set these environment variables:
   - `DATABASE_URL` — the Neon (or other Postgres) connection string
   - `SESSION_SECRET` — any long random string
   - `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` — for the initial seed
   - `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL` and/or `AFRICASTALKING_API_KEY` /
     `AFRICASTALKING_USERNAME` — optional; without these, OTP codes are only
     logged server-side (see below), which isn't usable by real users
3. Run migrations and seed against that same `DATABASE_URL` once, from anywhere
   that can reach it:
   ```bash
   DATABASE_URL=<your connection string> npm run db:migrate --workspace server
   DATABASE_URL=<your connection string> npm run --workspace server seed
   ```
4. Deploy. The build runs `npm run build:client` and serves `client/dist`, with
   `/api/*` routed to the serverless function and everything else falling back to
   `index.html` (so client-side routes survive a hard refresh).

## Setting up billing (Paystack)

Without `PAYSTACK_SECRET_KEY` configured, the billing routes (`/api/billing/*`) fail
cleanly — everything else, including the 14-day trial itself, works fine. To turn on
real paywalling:

1. Create a [Paystack](https://dashboard.paystack.com) account (test mode is fine to
   start) and, under **Products → Plans**, create **two** recurring Plans in ZAR:
   monthly (R750) and annual (R8,100 — 12 × R750 less 10%). Change the prices/copy in
   `client/src/pages/Billing.tsx` and `server/src/lib/paystack.ts`
   (`PLAN_AMOUNTS_ZAR`) if yours differ — the amount sent at checkout must match what
   the Plan is configured for.
2. Set `PAYSTACK_SECRET_KEY`, `PAYSTACK_PLAN_CODE_MONTHLY`, and `PAYSTACK_PLAN_CODE_ANNUAL`
   (each Plan's `plan_code`, `PLN_...`).
3. In Paystack's dashboard under **Settings → API Keys & Webhooks**, set the webhook
   URL to `<your-domain>/api/billing/webhook`. No separate signing secret to
   configure — Paystack signs webhook payloads with the same secret key.
4. That's it — `/billing` lets a tenant admin start a Standard Checkout redirect or
   open a Paystack subscription-management link (its closest equivalent to a hosted
   billing portal), and the webhook keeps `tenants.subscription_status` in sync
   (`active` / `past_due` / `cancelled`). Since Paystack's redirect back to us doesn't
   reliably distinguish success from failure/abandonment on its own, the Billing page
   also calls `GET /billing/verify?reference=...` to confirm the transaction directly
   rather than guessing from the redirect.

**Access is actually enforced**, not just displayed: once a tenant's trial ends and
they haven't subscribed, every tenant-scoped API route (institutions, properties,
students, invoices, reports, team) returns `402 SUBSCRIPTION_REQUIRED`, and the
frontend auto-redirects to `/billing` on that response. The whole app locks
client-side too — nav and every page disappear, `/billing` shows nothing but "Make a
payment to continue with Stuaps." Super-admins (Pits Marketing) bypass this
regardless of their own tenant's billing state.

### Premium add-on (financial statements + payroll)

Financial statements and payroll are billed as a separate, always-monthly Paystack
subscription (R200/month extra on the monthly base plan, R150/month extra on the
annual plan — a subscription can't mix billing intervals within itself, so the add-on
can't just be a line item on an annual base subscription). Set
`PAYSTACK_PLAN_CODE_ADDON_MONTHLY` and `PAYSTACK_PLAN_CODE_ADDON_ANNUAL_EXTRA` to two
more recurring Plans to enable `/billing`'s "Add Premium" button. `tenants.addon_status`
tracks it independently of the base `subscription_status`; `requirePremiumAddon`
middleware (`server/src/middleware/requirePremiumAddon.ts`) gates
`/api/financial-statements/*` the same way `requireActiveSubscription` gates the base
app. Payroll is not built yet — `/payroll` is still an upgrade-prompt placeholder.

#### Financial statements

Once the add-on is active, `/financial-statements` is a real (deliberately
simplified) bookkeeping + reporting tool, not a placeholder:
- **Expenses ledger** — tenant-wide (not per-institution) entries: date, category,
  description, amount, and whether it's already been paid or just accrued.
- **Income statement** (accrual basis) — revenue from invoiced totals in the date
  range, expenses grouped by category, net income.
- **Cash flow statement** (cash basis) — money that actually moved: paid invoices in
  the range plus paid expenses.
- **Balance sheet** (point-in-time) — accounts receivable (outstanding invoice
  balances) + cash collected as assets, unpaid expenses as accounts-payable
  liabilities, equity as the plug (assets − liabilities).

All three reports are pure, unit-tested functions
(`server/src/lib/financialStatements.ts` / `tests/financialStatements.test.ts`) fed by
straightforward SQL aggregation — no hidden logic. **This is single-entry
bookkeeping, not full double-entry accounting**, and there's one specific
simplification worth knowing: the schema has no per-payment ledger, only a single
`amountPaid` + `paidAt` snapshot per invoice. A fully-paid invoice's `paidAt` is
reliable; a merely-partial one has no timestamp for *when* that partial payment
happened, so cash flow falls back to the invoice's date for those. Good enough for
day-to-day visibility, not for a historically-precise cash flow statement — a real
payments table (one row per payment received, not one snapshot per invoice) would be
the natural next step if that precision matters. The page itself says as much:
"treat this as a planning tool, not filing-ready statements."

## PWA / Google Play

The client is an installable PWA (`vite-plugin-pwa`: manifest, service worker, icons
in `client/public/icons/`) — this is a *shell-installable* PWA (installable, reload-
resilient), not full offline read/write support, which is still out of scope (see
below). This is also the prerequisite for putting the app on Google Play: the
standard path is wrapping it as a **Trusted Web Activity** via
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) once it's deployed at a
stable HTTPS URL, then uploading the resulting `.aab` through the Play Console. That
needs a Google Play Developer account ($25 one-time) and, for signing, either
Bubblewrap's own keystore generation or Google Play App Signing.

## Setting up the Gmail statement inbox

Lets a tenant admin connect their Gmail account so Stuaps can watch for statement
emails from NSFAS or other student funders. Nothing is ever imported without an
explicit admin approval per email.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project,
   enable the **Gmail API**, and configure the OAuth consent screen (external, since
   tenants are outside your org).
2. Create an **OAuth 2.0 Client ID** (Web application) with an authorized redirect URI
   of `<your-app-origin>/api/email-integrations/gmail/callback`.
3. Set `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` to that client's credentials, and
   `ENCRYPTION_KEY` to a random secret (`openssl rand -hex 32`) — OAuth tokens are
   AES-256-GCM encrypted at rest, never stored in plaintext.
4. Without these set, `/email-inbox` still loads but shows "Gmail integration hasn't
   been set up on this server yet."

Once connected, an admin can "Scan now" (searches Gmail for `has:attachment` mail from
configured sender domains — defaults to `nsfas.org.za`, editable per tenant), review
each detected email, and approve or reject it. Approving downloads the attachment and:
- **CSV attachments** go through the exact same parser as a manual invoice upload.
- **PDF attachments** go through a best-effort text-extraction heuristic
  (`server/src/lib/pdfStatementParser.ts`) — funder statement layouts vary and change
  without notice, so this is *not* a guaranteed-correct parser. Every result (line
  items found, or just a total, or nothing) is written back as a preview for the admin
  to check, and the original attachment can always be downloaded and re-entered
  manually if the extraction looks wrong. Only line items whose extracted reference
  number matches an *existing* student in that institution get linked to that
  student — a mis-read reference never fabricates a new student record.

Outlook/Microsoft 365 isn't wired up yet (Gmail only, per current scope) — the schema
(`email_connections.provider`) already anticipates adding it as a second provider.

## OTP delivery in dev

`SENDGRID_API_KEY` and `AFRICASTALKING_API_KEY` are unset by default, so registration
OTP codes are logged to the server's stdout (`[otp:dev-console] ... OTP for ...: 123456`)
instead of actually being emailed/texted. Set those env vars to send real codes.

## What's implemented

- Multi-tenant schema: tenants, users (admin/staff roles), institutions, properties,
  students, invoices, invoice line items, OTP verifications — every query scoped to
  the authenticated user's tenant.
- Username/password login + session auth (no "Sign in with Replit" — providers only
  ever see username/password).
- Self-registration with OTP verification (email/SMS/both), creating a tenant + admin
  user in `trial` status with a 14-day trial window.
- CSV upload & parsing matching the real accounting export format (`STUD # <number>:
  <name> - <residence>` lines vs. fee/deduction lines), with an integrity check that
  rejects an upload if line items don't sum to the stated invoice Total.
  See `server/tests/` for parser/recon unit tests run against the actual TUT-01294
  sample data (validates the real 71,247.30 total, 76,610 student charges, -5,362.70
  fee credits).
- Per-invoice recon view, cross-invoice student billing summary, outstanding
  ("who owes what") report, and dashboard totals.
- Properties management per institution (name, address, capacity).
- Staff accounts: an admin can invite a staff user and scope them to specific
  institutions via `user_institution_access` — a staff user with no rows there has
  full tenant access (matches the original schema's "empty = all" convention); once
  they have at least one grant, every institution-scoped route (`/properties`,
  `/students`, `/invoices`, `/reports`, and the institution list itself) enforces it
  server-side, not just in the UI.
- Forgot username/password: OTP-based reset to the account's email, built on the same
  OTP infrastructure as registration. Deliberately enumeration-safe — the response is
  identical whether or not the username/email matches an account, and no code is ever
  sent for a non-match.
- Minimal super-admin panel (Pits Marketing): list all tenants, override subscription
  status.
- Light/dark theming via CSS variables, larger base font size, dense table-first UI.
- Paystack subscription billing: checkout, subscription-management link,
  webhook-driven status sync, and a real server-side paywall (402 + auto-redirect)
  once a trial lapses unpaid, mirrored client-side so the whole app locks (not just
  individual API calls). Separate Premium add-on subscription (financial statements +
  payroll billing).
- Financial statements (Premium add-on): an expenses ledger plus income statement,
  cash flow, and balance sheet reports computed from real invoice + expense data —
  see "Setting up billing" above for the specific simplifications.
- Installable PWA (manifest, service worker, icons) — the shell only; see below.
- Mobile-first navigation: a bottom tab bar with a "More" sheet on phone-sized
  viewports, full top nav on desktop — same routes, no separate mobile app.
- Printable reports: Dashboard, Outstanding, per-invoice recon, and Financial
  Statements each have a Print button and a dedicated print stylesheet (chrome
  hidden, plain black-on-white tables).
- Gmail statement inbox: connect a Gmail account, scan for funder statement emails,
  admin-approve each one before it's imported (CSV via the existing parser, PDF via a
  best-effort heuristic) — see "Setting up the Gmail statement inbox" below.

## Deliberately deferred (flagged, not built)

- **Full offline support** — the PWA is installable and reload-resilient, but there's
  no offline read/write (queued writes, background sync) for the actual invoice/recon
  data. That's a meaningfully bigger feature (conflict resolution for offline edits,
  etc.) than the "installable app shell" done here.
- **Actually publishing to Google Play** — the PWA groundwork is done, but wrapping it
  as a Trusted Web Activity, signing it, and getting through Play Console review are
  manual steps needing your own Google Play Developer account (see above).
- **Real SendGrid/Africa's Talking sends** are wired up but untested against live
  credentials — verify with a real API key before relying on them in production.
- **Forgot username** specifically isn't handled (only password reset) — a user who
  forgot their username but has their email can't currently recover it that way.
- **Paystack integration is untested against live keys** — built and unit-verifiable
  (webhook signature verification, plan-code inference, paywall enforcement — see
  `server/tests/paystack.test.ts`), but the actual checkout/webhook round-trip needs
  your Paystack test-mode keys to exercise for real. Renewal webhooks in particular
  (`charge.success` for a recurring charge, which carries no metadata — only the
  original checkout does) rely on matching the stored `paystack_customer_code`, which
  is only populated after the *first* successful webhook — untested against Paystack's
  actual renewal payloads.
- **Gmail OAuth is untested against a live Google client** — same reason as Paystack;
  the code path is complete but needs your own `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET`
  to exercise the real consent screen and token refresh.
- **Outlook/Microsoft 365 statement inbox** — not built, Gmail only for now.
- **PDF statement parsing is a heuristic, not a guaranteed-correct parser** — see
  the Gmail inbox section above. Expect to tune `pdfStatementParser.ts` against real
  funder statement samples.
- **Payroll/tax tools** — the Premium add-on is billed and gated
  (`tenants.addon_status`), and financial statements are built (see above), but
  `/payroll` is still an upgrade-prompt placeholder. Payroll/tax needs real
  accounting sign-off before being presented as filing-ready (UIF/PAYE tables, SARS
  compliance) — treat any future version as an estimate tool, not a substitute for an
  accountant, unless independently verified.
- **Financial statements are single-entry bookkeeping, not double-entry accounting**
  — no chart of accounts, no per-payment ledger (see "Setting up billing" above for
  exactly what that means for cash flow accuracy). Good for day-to-day visibility,
  not a substitute for a qualified accountant's actual books.

