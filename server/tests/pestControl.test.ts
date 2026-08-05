import { describe, it, expect } from "vitest";
import { nextDueDate, treatmentStatus } from "../src/lib/pestControl.js";

describe("nextDueDate", () => {
  it("adds four months", () => {
    expect(nextDueDate("2026-01-15")).toBe("2026-05-15");
  });

  it("rolls over a year boundary", () => {
    expect(nextDueDate("2026-10-05")).toBe("2027-02-05");
  });

  it("clamps to the last day when the target month is shorter", () => {
    expect(nextDueDate("2025-10-31")).toBe("2026-02-28");
  });

  it("clamps to 29 Feb in a leap year", () => {
    expect(nextDueDate("2027-10-31")).toBe("2028-02-29");
  });
});

describe("treatmentStatus", () => {
  it("reports never when there is no treatment on record", () => {
    expect(treatmentStatus(null, "2026-08-05")).toEqual({ status: "never", nextDueOn: null });
  });

  it("reports overdue once the due date has passed", () => {
    expect(treatmentStatus("2026-01-15", "2026-08-05")).toEqual({
      status: "overdue",
      nextDueOn: "2026-05-15",
    });
  });

  it("reports due_soon inside the 30-day window", () => {
    expect(treatmentStatus("2026-04-20", "2026-08-05")).toEqual({
      status: "due_soon",
      nextDueOn: "2026-08-20",
    });
  });

  it("reports ok when the next treatment is comfortably away", () => {
    expect(treatmentStatus("2026-07-01", "2026-08-05")).toEqual({
      status: "ok",
      nextDueOn: "2026-11-01",
    });
  });

  it("treats the due date itself as not yet overdue", () => {
    expect(treatmentStatus("2026-04-05", "2026-08-05").status).toBe("due_soon");
  });
});
