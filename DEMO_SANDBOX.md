# Demo Sandbox Setup

This guide explains how to set up and use the STUAPS demo environment for sales and feature showcasing.

## Quick Start

### 1. Create a Demo Database Branch (Neon)

For each demo:
```bash
# Via Neon dashboard:
# 1. Go to your Neon project
# 2. Create a new branch from main: "demo-YYYY-MM-DD"
# 3. Copy the connection string

# Or via Neon API (if configured):
neon branch create --name demo-$(date +%Y-%m-%d) --project-id <your-project-id>
```

### 2. Deploy with Test Environment Variables

Set these in your Vercel deployment or `.env.local`:

```env
# Neon demo branch connection string
DATABASE_URL=postgres://user:pass@ep-xxx.us-east-1.neon.tech/stuaps

# Test Paystack keys (for Paystack Sandbox account)
# Get these from https://dashboard.paystack.com (toggle to Test mode)
PAYSTACK_SECRET_KEY=sk_test_[your_sandbox_secret_key_here]
PAYSTACK_PLAN_CODE_MONTHLY=PLN_demo_monthly_12345
PAYSTACK_PLAN_CODE_ANNUAL=PLN_demo_annual_67890
PAYSTACK_PLAN_CODE_ADDON_MONTHLY=PLN_demo_addon_monthly_11111
PAYSTACK_PLAN_CODE_ADDON_ANNUAL_EXTRA=PLN_demo_addon_annual_22222

# Demo credentials
SUPERADMIN_USERNAME=pitsadmin
SUPERADMIN_PASSWORD=demo123

CRON_SECRET=demo-cron-secret-key
```

### 3. Run the Seeder

```bash
npm run seed --workspace server
```

This creates:
- **Demo Tenant**: "Demo Property" (pre-activated subscription)
- **Demo User**: username `demo`, password `demo123`
- **Demo Institution**: "Demo University Residence" (Johannesburg)
- **2 Properties**: North Wing, South Wing
- **52 Students**: Invoiced across 3 invoices (90-day window)
  - 40 students in recent invoices (within billing window)
  - 12+ extra students in older invoices (demonstrates overage billing)
- **Pest Control Records**: 
  - North Wing: treated 30 days ago (due soon)
  - South Wing: treated 120+ days ago (overdue)

## Demo Walkthrough Scenarios

### Scenario 1: Usage Billing Demo
1. Log in with `demo` / `demo123`
2. Go to **Billing** page
3. See the metered usage:
   - "Students billed": 40-45 (from recent invoices)
   - "Included": 50 (plan allowance)
   - "Above allowance": 0-5 (if over threshold)
   - "Next monthly bill": R750 base + R2.50 × (students over 50)
4. Show charge history table with past billings

### Scenario 2: Pest Control Tracking Demo
1. Go to **Pest Control** page
2. See properties with treatment status:
   - North Wing: "Due soon" (30 days ago, next due in ~90 days)
   - South Wing: "Overdue" (120+ days ago, way over)
3. Click "Treat now" to log a treatment
4. Verify timestamp updates and status changes

### Scenario 3: Payment Demand Letter Demo
1. Go to **Outstanding** (Reports tab)
2. See students with outstanding invoices
3. Click "Request payment" on any student
4. View the printable demand letter
5. Print to PDF or discuss tailoring language

### Scenario 4: Paystack Integration (Test Card)
1. Go to **Billing** → "Upgrade now"
2. Select monthly or annual plan
3. Use test card (Paystack Sandbox):
   - **Card**: 4111 1111 1111 1111
   - **Exp**: 01/50
   - **CVV**: 123
   - **OTP** (if prompted): 123456
4. Verify payment redirects back and marks subscription as "active"
5. Show updated billing info on return

## Cleanup

### Delete a Demo Branch (Neon)
```bash
# Via Neon dashboard:
# Settings → Branches → select demo branch → Delete

# Or via API:
neon branch delete --name demo-YYYY-MM-DD --project-id <your-project-id>
```

### Reset Demo Data
To reset the demo within the same branch:
```bash
# Clear all user data (keeps schema)
npm run db:reset --workspace server

# Re-seed fresh data
npm run seed --workspace server
```

## Paystack Sandbox Setup

1. Create a Paystack Sandbox account at https://dashboard.paystack.com (test mode)
2. Generate test plan codes in the Paystack dashboard:
   - Monthly base: R750 (monthly)
   - Annual base: R8100 (annual)
   - Monthly addon: R200 (monthly)
   - Annual addon: R150 (annual)
3. Copy the plan codes to your environment variables
4. Use Paystack's test card for checkout flows

## Neon Database Branches

Neon provides free database branches ideal for demos:
- Each branch is isolated, so demos don't affect production
- Branches can be created/deleted in minutes
- Data persists for the branch's lifetime (useful for multi-day sales cycles)
- Reset by deleting and recreating the branch

### Example Workflow
```bash
# Day 1: Create demo
neon branch create --name demo-2025-08-05

# Days 1-3: Use for sales calls
# (Data persists, can reset via web UI or API)

# Day 3 evening: Clean up
neon branch delete --name demo-2025-08-05
```

## Test Accounts & Cards

### Paystack Test Card (Standard)
- Card: 4111 1111 1111 1111
- Exp: 01/99 (any future date)
- CVV: 123
- Type: Visa

### Paystack Test Card (OTP)
- Card: 5399 8343 1234 5678
- Exp: 01/99
- CVV: 101
- Type: Mastercard (may require OTP)

For more test cards, see [Paystack Documentation](https://paystack.com/docs/payments/test-authentication/).

## Common Demo Issues

### "Card authorization failed"
- Check Paystack test keys are correct
- Ensure plan codes match Paystack dashboard
- Try a different test card

### "Students not showing as invoiced"
- Verify invoices have `invoiceDate` within last 90 days
- Ensure line items have `studentId` populated
- Check `invoiceStatus` is not "draft"

### Pest control dates off by 1 day
- Dates use UTC; check local timezone for month-end clamping
- `nextDueDate()` adds 4 months and clamps to month-end if needed

## Extending the Demo

To add more features to the seeded demo:
1. Edit `server/src/db/seed.ts`
2. Add sample data for the new feature
3. Re-run `npm run seed` to regenerate
4. Test on the demo branch before showing to customers

Example: Adding test expense records, lease agreements, or maintenance schedules.
