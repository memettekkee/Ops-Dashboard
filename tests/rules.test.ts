import { describe, it, expect } from "vitest";
import {
  complianceFromDays,
  computeUsable,
  torqueCompliance,
  torqueDeviation,
} from "@/domain/rules";
import type { TorqueSession } from "@/domain/types";

describe("complianceFromDays", () => {
  it("maps thresholds correctly", () => {
    expect(complianceFromDays(-1)).toBe("EXPIRED");
    expect(complianceFromDays(0)).toBe("DUE_30");
    expect(complianceFromDays(30)).toBe("DUE_30");
    expect(complianceFromDays(31)).toBe("DUE_60");
    expect(complianceFromDays(60)).toBe("DUE_60");
    expect(complianceFromDays(61)).toBe("VALID");
    expect(complianceFromDays(undefined)).toBe("UNKNOWN");
  });
});

describe("computeUsable", () => {
  it("ok when valid + active", () => {
    expect(computeUsable({ compliance: "VALID", condition: "ACTIVE" }).ok).toBe(true);
  });
  it("not ok when expired, with reason", () => {
    const v = computeUsable({ compliance: "EXPIRED", condition: "ACTIVE", expiryLabel: "21 Mar 2026" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reasons.join(" ")).toContain("21 Mar 2026");
  });
});

function session(partial: Partial<TorqueSession>): TorqueSession {
  return {
    assetId: "TW-BRC-200-68NM",
    period: "2026-09",
    sessionIndex: 0,
    readings: [],
    overall: "NO_DATA",
    rangeInvalid: false,
    ...partial,
  };
}

describe("torqueCompliance", () => {
  const today = new Date("2026-10-10");
  it("valid when all readings in range and overall OK", () => {
    const s = session({ min: 58, max: 75, readings: [60, 65, 70], overall: "OK", checkedAt: new Date("2026-10-05") });
    expect(torqueCompliance(s, today).compliance).toBe("VALID");
  });
  it("tidak lolos when NOT_OK", () => {
    const s = session({ min: 58, max: 75, readings: [80], overall: "NOT_OK", checkedAt: new Date("2026-10-05") });
    expect(torqueCompliance(s, today).compliance).toBe("EXPIRED");
  });
  it("unknown when range invalid", () => {
    const s = session({ min: 75, max: 75, readings: [75], overall: "OK", rangeInvalid: true });
    expect(torqueCompliance(s, today).compliance).toBe("UNKNOWN");
  });
});

describe("torqueDeviation", () => {
  it("computes target and deviation", () => {
    const s = session({ min: 58, max: 75, readings: [66, 67, 66] });
    const d = torqueDeviation(s);
    expect(d.target).toBeCloseTo(66.5);
    expect(d.deviationPct).toBeDefined();
    expect(d.marginPct).toBeDefined();
  });
});
