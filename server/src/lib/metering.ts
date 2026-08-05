import type { BillingPlan } from "./paystack.js";
import { PLAN_AMOUNTS_ZAR } from "./paystack.js";

/** Students included in the base plan price before per-student billing starts. */
export const INCLUDED_STUDENTS = 50;

/** Rand per extra student, per billing period. The annual rate is the monthly
 *  rate over 12 months less the same 10% the annual base plan discounts by, so
 *  a provider isn't quietly charged more per student for paying up front. */
export const OVERAGE_RATE_ZAR: Record<BillingPlan, number> = {
  monthly: 2.5,
  annual: Number((2.5 * 12 * 0.9).toFixed(2)), // R27.00 per student per year
};

/**
 * How far back an invoice counts a student as still being housed.
 *
 * Funder invoices arrive monthly, but a provider can be a few weeks late
 * uploading one, and trimester students don't appear on every month's invoice.
 * A 90-day window covers both without ever billing for students who left —
 * counting the whole roster instead would keep charging for people who
 * graduated years ago, since students are never removed once imported.
 */
export const ACTIVE_WINDOW_DAYS = 90;

export interface Bill {
  activeStudents: number;
  includedStudents: number;
  billableExtraStudents: number;
  baseRand: number;
  overageRand: number;
  totalRand: number;
}

export function computeBill(activeStudents: number, plan: BillingPlan): Bill {
  const billableExtraStudents = Math.max(0, activeStudents - INCLUDED_STUDENTS);
  const baseRand = PLAN_AMOUNTS_ZAR[plan];
  const overageRand = Number((billableExtraStudents * OVERAGE_RATE_ZAR[plan]).toFixed(2));
  return {
    activeStudents,
    includedStudents: INCLUDED_STUDENTS,
    billableExtraStudents,
    baseRand,
    overageRand,
    totalRand: Number((baseRand + overageRand).toFixed(2)),
  };
}

/** The first day of the period a charge belongs to, used to keep overage charges idempotent. */
export function periodStartFor(date: Date, plan: BillingPlan): string {
  const year = date.getUTCFullYear();
  const month = plan === "annual" ? 0 : date.getUTCMonth();
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

/** Oldest invoice date that still counts toward the active-student window. */
export function activeSinceDate(today: Date): string {
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - ACTIVE_WINDOW_DAYS);
  return since.toISOString().slice(0, 10);
}
