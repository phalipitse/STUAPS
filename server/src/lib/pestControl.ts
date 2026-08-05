/** Three treatments a year, so one stays current for four months. */
export const TREATMENT_INTERVAL_MONTHS = 4;

/** Flagged as "due soon" once the next treatment is within this window. */
export const DUE_SOON_DAYS = 30;

export type PestControlStatus = "never" | "overdue" | "due_soon" | "ok";

export function nextDueDate(lastTreatedOn: string): string {
  const [year, month, day] = lastTreatedOn.split("-").map(Number);
  // Day 0 of the following month clamps an overflowing day-of-month back to
  // that month's last day, so 31 Oct + 4 months lands on 28/29 Feb rather than
  // rolling into March the way a naive setMonth would.
  const due = new Date(Date.UTC(year, month - 1 + TREATMENT_INTERVAL_MONTHS, day));
  if (due.getUTCDate() !== day) {
    due.setUTCDate(0);
  }
  return due.toISOString().slice(0, 10);
}

export function treatmentStatus(
  lastTreatedOn: string | null,
  today: string
): { status: PestControlStatus; nextDueOn: string | null } {
  if (!lastTreatedOn) return { status: "never", nextDueOn: null };

  const nextDueOn = nextDueDate(lastTreatedOn);
  if (nextDueOn < today) return { status: "overdue", nextDueOn };

  const soonCutoff = new Date(`${today}T00:00:00Z`);
  soonCutoff.setUTCDate(soonCutoff.getUTCDate() + DUE_SOON_DAYS);
  if (nextDueOn <= soonCutoff.toISOString().slice(0, 10)) {
    return { status: "due_soon", nextDueOn };
  }
  return { status: "ok", nextDueOn };
}
