import { describe, it, expect } from "vitest";
import {
  computeBill,
  periodStartFor,
  activeSinceDate,
  INCLUDED_STUDENTS,
  OVERAGE_RATE_ZAR,
} from "../src/lib/metering.js";

describe("computeBill (monthly)", () => {
  it("charges the flat base with no students at all", () => {
    expect(computeBill(0, "monthly")).toMatchObject({
      billableExtraStudents: 0,
      overageRand: 0,
      totalRand: 750,
    });
  });

  it("charges the flat base right up to the included limit", () => {
    expect(computeBill(INCLUDED_STUDENTS, "monthly")).toMatchObject({
      billableExtraStudents: 0,
      overageRand: 0,
      totalRand: 750,
    });
  });

  it("has no cliff at the threshold — one student over costs one unit", () => {
    expect(computeBill(51, "monthly")).toMatchObject({
      billableExtraStudents: 1,
      overageRand: 2.5,
      totalRand: 752.5,
    });
  });

  it("bills 60 students at R775", () => {
    expect(computeBill(60, "monthly").totalRand).toBe(775);
  });

  it("bills 100 students at R875", () => {
    expect(computeBill(100, "monthly").totalRand).toBe(875);
  });

  it("bills 500 students at R1,875", () => {
    expect(computeBill(500, "monthly").totalRand).toBe(1875);
  });

  it("never goes below the base for a negative or nonsense count", () => {
    expect(computeBill(-5, "monthly").totalRand).toBe(750);
  });
});

describe("computeBill (annual)", () => {
  it("charges the annual base within the included limit", () => {
    expect(computeBill(50, "annual")).toMatchObject({
      billableExtraStudents: 0,
      totalRand: 8100,
    });
  });

  it("discounts the per-student rate by the same 10% as the base plan", () => {
    expect(OVERAGE_RATE_ZAR.annual).toBe(27);
    expect(OVERAGE_RATE_ZAR.annual).toBeCloseTo(OVERAGE_RATE_ZAR.monthly * 12 * 0.9, 2);
  });

  it("bills 100 students at R8,100 + 50 x R27", () => {
    expect(computeBill(100, "annual")).toMatchObject({
      billableExtraStudents: 50,
      overageRand: 1350,
      totalRand: 9450,
    });
  });
});

describe("periodStartFor", () => {
  it("buckets monthly charges by calendar month", () => {
    expect(periodStartFor(new Date("2026-08-05T12:00:00Z"), "monthly")).toBe("2026-08-01");
    expect(periodStartFor(new Date("2026-08-28T23:59:00Z"), "monthly")).toBe("2026-08-01");
  });

  it("gives a different bucket in the next month, so the next renewal can charge again", () => {
    expect(periodStartFor(new Date("2026-09-01T00:00:00Z"), "monthly")).toBe("2026-09-01");
  });

  it("buckets annual charges by calendar year", () => {
    expect(periodStartFor(new Date("2026-08-05T12:00:00Z"), "annual")).toBe("2026-01-01");
  });
});

describe("activeSinceDate", () => {
  it("looks back 90 days", () => {
    expect(activeSinceDate(new Date("2026-08-05T00:00:00Z"))).toBe("2026-05-07");
  });

  it("crosses a year boundary correctly", () => {
    expect(activeSinceDate(new Date("2026-02-15T00:00:00Z"))).toBe("2025-11-17");
  });
});
