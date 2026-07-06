# App build prompt: Student Accommodation Recon

This spec has evolved from a single-user internal tool into a multi-tenant SaaS product
(current build: "Student Accommodation Recon" on Replit). This file tracks the current
intended scope — update it as the Replit build evolves so the two stay in sync.

Paste the prompt below into Claude or Replit to scaffold the app from scratch, or use it
as a reference spec when reviewing/extending the existing build.

```
Build a multi-tenant web app called "Student Accommodation Recon" that automates payment
reconciliation for accommodation providers who bill student residence fees monthly through
an accounting export, across multiple partner institutions.

## Background / domain

Each provider (tenant) manages one or more institutions they invoice — e.g. TUT (Tshwane
University of Technology), UFS (University of the Free State), TnC — each with its own
set of residences/properties and its own monthly invoice cycle. Each month, per
institution, the provider exports an invoice as CSV from their accounting system
(Xero-style export) with these exact columns:

ContactName, EmailAddress, POAddressLine1, POAddressLine2, POAddressLine3, POAddressLine4,
POCity, PORegion, POPostalCode, POCountry, InvoiceNumber, Reference, InvoiceDate, DueDate,
Total, Description, Quantity, UnitAmount, Discount, TaxAmount

- One CSV = one invoice (all rows share the same InvoiceNumber, InvoiceDate, DueDate, Total).
- Most rows are per-student charges. Description follows the pattern:
  "STUD # <student number>: <STUDENT FULL NAME> - <RESIDENCE NAME>"
  Example: "STUD # 221520572: MATHEBULA NDZALAMA GANTY - SAINT POWERPOINT"
- A few rows are fee deductions, NOT tied to a student. Their Description does not start
  with "STUD #" — e.g. "BITVENTURE PROCESSING FEE", "TUTEH MANAGEMENT FEE". These always
  have a negative UnitAmount and Quantity of 1, and represent processing/management fees
  subtracted from the gross student charges.
- Line total = Quantity × UnitAmount. Sum of all line totals (students + fee deductions)
  equals the invoice Total.
- The same student can appear on some months' invoices and not others (roster changes
  month to month — students leave, new ones are added).
- Payment status is NOT in the CSV. The provider marks each invoice as Paid or Outstanding
  manually once it's been reconciled against their bank statement.

## Accounts & access

- **Registration & trial**: providers self-register (business name, email, password) and
  start on a free trial with a defined length and student/invoice limits; a clear
  upgrade path when the trial ends or limits are hit.
- **Authentication**: username/password login with session management. Support both
  provider-owner accounts and staff accounts under the same tenant.
- **Roles & permissions**: at least (a) Owner/Admin — full access including billing,
  user management, and all institutions; (b) Staff — can view/manage recon data for
  assigned institutions but not billing or user management. Enforce this on every
  API route, not just in the UI.
- **Multi-tenant data scoping**: every table (invoices, line items, students,
  properties) is scoped to a tenant (provider) ID, and every query must filter by the
  authenticated user's tenant. No tenant should ever be able to see another tenant's
  data — this is the most important security property of the app.

## Institutions / entities

- A tenant can manage multiple institutions (e.g. TUT, UFS, TnC), each with its own
  invoice sequence, residences/properties, and student roster.
- Provide a dedicated page per institution with the ability to filter all recon views
  (invoices, students, outstanding report) by institution, and a combined "all
  institutions" view for the overall dashboard.
- A **properties/residences** section lets the provider manage the list of
  accommodation properties per institution (name, address, capacity) that the student
  roster's "residence" field is validated/matched against.

## Core recon features

1. **Invoice upload & parsing**
   - Upload a CSV per institution, auto-detect the invoice number/date/due date/total.
   - Parse each row: if Description matches `^STUD # (\d+): (.+) - (.+)$`, capture
     student number, student name, and residence as a student line item. Otherwise,
     treat the row as a fee/deduction line item (store its description and amount).
   - Reject/flag rows that don't sum to the stated Total (integrity check).
   - Store the parsed invoice with its line items, scoped to the tenant + institution.

2. **Student roster**
   - Maintain a master list of students per institution (student number, name, surname,
     residence, campus) that persists across invoices — a student is added the first
     time they appear on any invoice, and stays in the roster even if dropped from a
     later invoice.
   - Allow manual edit of roster fields (e.g. correct a misspelled surname, add campus).

3. **Per-invoice recon view**
   - For each invoice: table of student line items (student number, name, qty, unit
     price, amount) + fee line items, then Total, Amount Paid, Amount Due.
   - Toggle to mark an invoice (or a specific student's portion) as Paid / Outstanding,
     with a paid-date and optional note.

4. **Cross-invoice payment summary**
   - A table with one row per student (all-time roster, per institution) and one column
     per invoice/month, showing: billed amount for that student in that invoice (0 or
     blank if not on that invoice), and status (Outstanding / Paid / not invoiced that
     month).
   - A computed "Total Billed" column (sum across all invoices) and an "Overall Status"
     column that summarizes across months, e.g. "Apr paid; May outstanding; Jul outstanding"
     or "Not invoiced" if the student has never appeared on any invoice.
   - Visually highlight rows/cells that are Outstanding (e.g. red background) vs Paid
     (neutral/green).

5. **Total report / dashboard**
   - Grand totals: total billed (gross, sum of student line items only, excluding fees),
     total fee credits, total invoiced (net), total paid, total outstanding — across all
     invoices, filterable by institution.
   - A live "who owes what" breakdown: list every student with an outstanding balance,
     broken down by which invoice(s) they're outstanding on and the amount per invoice,
     plus their total owed. Sort by amount owed descending by default.
   - Filter/segment: "outstanding on multiple invoices", "outstanding on one invoice only",
     "never invoiced", "fully paid".
   - Export the report to CSV/Excel and/or a shareable PDF.

6. **Fee handling**
   - Fee/deduction line items should never be matched to a student and should be excluded
     from per-student totals, but included in the invoice-level Total/Amount Due
     calculation and shown separately as "fee credits" in the invoice reconciliation
     summary (e.g. Student Charges: R76,610.00; Fee Credits: -R5,362.70; Invoice Total:
     R71,247.30).

## Data model (suggest this shape, adjust as needed)

- Tenant: id, business_name, plan (trial/paid), trial_ends_at
- User: id, tenant_id, email, password_hash, role (admin/staff), institution_access (list)
- Institution: id, tenant_id, name (e.g. "TUT"), invoice_prefix
- Property: id, institution_id, name, address, capacity
- Invoice: id, institution_id, invoice_number (unique per institution), invoice_date,
  due_date, total, amount_paid, amount_due, status (paid/outstanding/partial), account_no
- InvoiceLineItem: id, invoice_id, student_id (nullable — null for fee lines),
  description, quantity, unit_amount, line_total, is_fee (bool)
- Student: id, institution_id, student_number (unique per institution), name, surname,
  residence, campus, first_seen_invoice_id

## Tech stack

React/Next.js (or similar) frontend, Node/Express or Next.js API routes backend,
Postgres for storage (multi-tenant data needs real relational integrity, not SQLite).
Use a CSV parsing library (e.g. papaparse) on upload. Session-based auth
(e.g. Passport/NextAuth) with tenant + role enforced server-side on every route.

## Additional product requirements (from current build)

- **PWA / offline support**: installable as a PWA; core recon views (viewing already
  synced invoices/students/reports) should work offline, with sync-on-reconnect for
  any status changes made while offline.
- **Theming**: support multiple visual themes (light/dark/etc.) selectable per user,
  without breaking the outstanding/paid color semantics (red = outstanding must stay
  legible and distinct in every theme).
- **Accessibility**: base font size should default larger than typical dense-table UIs
  for readability; respect user font-size preference across the whole app, not just
  the dashboard.

## Non-functional requirements

- All monetary values in South African Rand, formatted as "R#,##0.00" with negatives
  in parentheses (matches original spreadsheet convention).
- Handle re-uploading the same invoice number for the same institution (update in
  place, don't duplicate).
- Handle a student appearing on invoice N with a different name spelling — surface this
  as a possible duplicate/mismatch warning rather than silently creating two students.
- Keep the UI dense and table-first (this replaces an Excel workbook), not marketing-page
  styled — favor clarity and scanability of numbers over decoration, even with the
  larger default font size.

## Acceptance check (use this to sanity-test the parser and totals)

Given a CSV with 16 "STUD #" rows (qty 1 each, unit amounts either 4600.00 or 4934.60)
plus two fee rows ("BITVENTURE PROCESSING FEE" qty 1 unit -3064.40, "TUTEH MANAGEMENT FEE"
qty 1 unit -2298.30), the invoice Total must compute to 71247.30, matching the CSV's
stated Total column for every row.
```

## Open questions to confirm against the live Replit build

- What does **TnC** stand for (institution full name)? Confirm so labels/branding match.
- Trial length and any hard limits (max students / invoices / institutions) on the free tier.
- Whether "properties" are meant to be TUT/UFS/TnC-owned residences, or the provider's
  own managed properties across institutions — affects how Property relates to Institution.
