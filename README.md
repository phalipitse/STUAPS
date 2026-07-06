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

## Setting up billing (Stripe)

Without `STRIPE_SECRET_KEY` configured, the billing routes (`/api/billing/*`) fail
cleanly with a 500 — everything else, including the 7-day trial itself, works fine.
To turn on real paywalling:

1. Create a Stripe account and, in test mode, a Product + recurring Price (R750/month
   in this build's default copy — change the price/copy in `client/src/pages/Billing.tsx`
   if yours differs).
2. Set `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` (the Price's ID, `price_...`).
3. Create a webhook endpoint in Stripe pointing at `<your-domain>/api/billing/webhook`,
   listening for `checkout.session.completed`, `customer.subscription.updated`, and
   `customer.subscription.deleted`. Set `STRIPE_WEBHOOK_SECRET` to its signing secret.
4. That's it — `/billing` in the app lets a tenant admin start a Checkout session or
   open the Stripe-hosted billing portal, and the webhook keeps `tenants.subscription_status`
   in sync (`active` / `past_due` / `cancelled`).

**Access is actually enforced**, not just displayed: once a tenant's trial ends and
they haven't subscribed, every tenant-scoped API route (institutions, properties,
students, invoices, reports, team) returns `402 SUBSCRIPTION_REQUIRED`, and the
frontend auto-redirects to `/billing` on that response. Super-admins (Pits Marketing)
bypass this regardless of their own tenant's billing state.

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
- Stripe subscription billing: checkout, billing portal, webhook-driven status sync,
  and a real server-side paywall (402 + auto-redirect) once a trial lapses unpaid.
- Installable PWA (manifest, service worker, icons) — the shell only; see below.

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
- **Stripe integration is untested against live keys** — built and unit-verifiable
  (lazy client init, status mapping, paywall enforcement), but the actual Checkout /
  webhook round-trip needs your Stripe test-mode keys to exercise for real.

