import { and, eq, gte, sql, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  tenants,
  institutions,
  invoices,
  invoiceLineItems,
  billingUsageCharges,
} from "../db/schema.js";
import { computeBill, periodStartFor, activeSinceDate, type Bill } from "./metering.js";
import { chargeAuthorization, isPaystackConfigured, type BillingPlan } from "./paystack.js";

export function planOf(tenant: { billingPlan: string | null }): BillingPlan {
  return tenant.billingPlan === "annual" ? "annual" : "monthly";
}

/**
 * Distinct students the tenant has invoiced within the active window.
 *
 * Counted off invoice line items rather than the students table on purpose:
 * students are never removed once an invoice imports them, so the roster only
 * ever grows and would bill a provider for people who left years ago.
 */
export async function countActiveStudents(tenantId: number, today = new Date()): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${invoiceLineItems.studentId})::int` })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
    .innerJoin(institutions, eq(invoices.institutionId, institutions.id))
    .where(
      and(
        eq(institutions.tenantId, tenantId),
        isNotNull(invoiceLineItems.studentId),
        gte(invoices.invoiceDate, activeSinceDate(today))
      )
    );
  return row?.count ?? 0;
}

export async function currentBillFor(
  tenant: { id: number; billingPlan: string | null },
  today = new Date()
): Promise<Bill> {
  return computeBill(await countActiveStudents(tenant.id, today), planOf(tenant));
}

/**
 * Bills the tenant for students above the included allowance for this period.
 *
 * Idempotency comes from the unique (tenant, period) index rather than a
 * read-then-write check: Paystack retries webhooks and a single renewal can
 * arrive as more than one event, so whether the insert succeeds is what decides
 * whether the card is charged.
 */
export async function chargeOverageForPeriod(
  tenantId: number,
  today = new Date()
): Promise<{ charged: boolean; reason?: string; bill?: Bill }> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return { charged: false, reason: "tenant not found" };

  const plan = planOf(tenant);
  const bill = await currentBillFor(tenant, today);
  if (bill.overageRand <= 0) return { charged: false, reason: "no students over the allowance", bill };

  if (!isPaystackConfigured()) return { charged: false, reason: "billing not configured", bill };
  if (!tenant.paystackAuthorizationCode) {
    return { charged: false, reason: "no saved card authorization yet", bill };
  }

  const periodStart = periodStartFor(today, plan);
  const reference = `stuaps-usage-${tenant.id}-${periodStart}`;

  // Claim the period first. A duplicate webhook loses the race here and never
  // reaches the charge call below.
  const claimed = await db
    .insert(billingUsageCharges)
    .values({
      tenantId: tenant.id,
      periodStart,
      plan,
      activeStudents: bill.activeStudents,
      billableExtraStudents: bill.billableExtraStudents,
      amountRand: bill.overageRand.toFixed(2),
      status: "pending",
    })
    .onConflictDoNothing()
    .returning();

  if (claimed.length === 0) {
    return { charged: false, reason: "already charged for this period", bill };
  }
  const chargeRow = claimed[0];

  try {
    const result = await chargeAuthorization({
      email: tenant.contactEmail,
      amountRand: bill.overageRand,
      authorizationCode: tenant.paystackAuthorizationCode,
      reference,
      metadata: {
        tenantId: String(tenant.id),
        kind: "usage",
        periodStart,
        activeStudents: String(bill.activeStudents),
      },
    });

    await db
      .update(billingUsageCharges)
      .set({
        status: result.status === "success" ? "success" : "failed",
        paystackReference: result.reference,
        failureReason: result.status === "success" ? null : (result.gateway_response ?? result.status),
      })
      .where(eq(billingUsageCharges.id, chargeRow.id));

    return { charged: result.status === "success", bill };
  } catch (err) {
    // Leave the row behind as "failed" rather than deleting it, so a retried
    // webhook doesn't silently re-attempt a charge that may already have gone
    // through on Paystack's side. Recovering it is a deliberate manual step.
    await db
      .update(billingUsageCharges)
      .set({ status: "failed", failureReason: err instanceof Error ? err.message : String(err) })
      .where(eq(billingUsageCharges.id, chargeRow.id));
    return { charged: false, reason: "charge failed", bill };
  }
}

export async function recentUsageCharges(tenantId: number, limit = 12) {
  return db
    .select()
    .from(billingUsageCharges)
    .where(inArray(billingUsageCharges.tenantId, [tenantId]))
    .orderBy(sql`${billingUsageCharges.periodStart} desc`)
    .limit(limit);
}
