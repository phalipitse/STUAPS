import type { SessionTenant } from "../auth/AuthContext";

export function trialDaysLeft(tenant: SessionTenant | null): number | null {
  if (!tenant?.trialEndsAt) return null;
  const diffMs = new Date(tenant.trialEndsAt).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/** Mirrors the server's requireActiveSubscription check so the UI locks in step with the API. */
export function isLocked(tenant: SessionTenant | null): boolean {
  if (!tenant) return false;
  if (tenant.subscriptionStatus === "active") return false;
  if (tenant.subscriptionStatus === "past_due" || tenant.subscriptionStatus === "cancelled") {
    return true;
  }
  if (!tenant.trialEndsAt) return true;
  return new Date(tenant.trialEndsAt).getTime() <= Date.now();
}
