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
  user in `trial` status with a 7-day trial window.
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

## Deliberately deferred (flagged, not built)

- **Payment collection** (Phase 3 in the original plan) — no billing/payment gateway
  integration. `subscriptionStatus` can be set manually via the super-admin panel.
- **PWA/offline support** — not implemented; the spec calls for it but it adds real
  complexity (service worker caching strategy, offline write queue) that didn't fit
  this pass. The app is a normal online SPA today.
- **Real SendGrid/Africa's Talking sends** are wired up but untested against live
  credentials — verify with a real API key before relying on them in production.
- **Forgot username** specifically isn't handled (only password reset) — a user who
  forgot their username but has their email can't currently recover it that way.
