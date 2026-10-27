import { differenceInCalendarDays, addMonths } from "date-fns";
import type {
  ComplianceStatus,
  PhysicalCondition,
  TorqueSession,
  UsableVerdict,
  VerificationResult,
} from "./types";
import {
  DUE_30_DAYS,
  DUE_60_DAYS,
  CALIBRATION_INTERVAL_MONTHS,
  TORQUE_CHECK_OVERDUE_DAYS,
} from "@/config/thresholds";

export function daysToExpiry(expiry: Date | undefined, today: Date): number | undefined {
  if (!expiry) return undefined;
  return differenceInCalendarDays(expiry, today);
}

export function complianceFromDays(days: number | undefined): ComplianceStatus {
  if (days === undefined) return "UNKNOWN";
  if (days < 0) return "EXPIRED";
  if (days <= DUE_30_DAYS) return "DUE_30";
  if (days <= DUE_60_DAYS) return "DUE_60";
  return "VALID";
}

/** Estimate expiry from last calibration + interval. */
export function estimateMeasuringExpiry(lastCalibration: Date | null | undefined): Date | undefined {
  if (!lastCalibration) return undefined;
  return addMonths(lastCalibration, CALIBRATION_INTERVAL_MONTHS);
}

export interface TorqueComputation {
  compliance: ComplianceStatus;
  passed: boolean | null; // null if cannot be computed
}

/** Compliance for a torque wrench, from its latest valid session. */
export function torqueCompliance(
  session: TorqueSession | undefined,
  today: Date,
): TorqueComputation {
  if (!session) return { compliance: "UNKNOWN", passed: null };
  if (session.rangeInvalid) return { compliance: "UNKNOWN", passed: null };

  const detail = (session.detailStatus ?? "").toUpperCase();
  const hasReading = session.readings.some((r) => r !== null);

  if (!hasReading && session.overall === "NO_DATA") {
    return { compliance: "UNKNOWN", passed: null };
  }

  if (session.overall === "NOT_OK" || detail === "REPAIR" || detail === "DONT") {
    return { compliance: "EXPIRED", passed: false };
  }

  // Check if monthly check is stale.
  if (session.checkedAt) {
    const age = differenceInCalendarDays(today, session.checkedAt);
    if (age > TORQUE_CHECK_OVERDUE_DAYS) {
      return { compliance: "DUE_30", passed: true };
    }
  }

  const allInRange =
    session.min !== undefined &&
    session.max !== undefined &&
    session.readings
      .filter((r): r is number => r !== null)
      .every((r) => r >= session.min! && r <= session.max!);

  if (session.overall === "OK" && allInRange) {
    return { compliance: "VALID", passed: true };
  }
  if (allInRange) return { compliance: "VALID", passed: true };
  return { compliance: "EXPIRED", passed: false };
}

/** Compute whether an asset is usable today and the reasons if not. */
export function computeUsable(input: {
  compliance: ComplianceStatus;
  condition: PhysicalCondition;
  lastCheckResult?: string;
  expiryLabel?: string;
}): UsableVerdict {
  const reasons: string[] = [];
  const complianceOk =
    input.compliance === "VALID" ||
    input.compliance === "DUE_60" ||
    input.compliance === "DUE_30";

  if (!complianceOk) {
    if (input.compliance === "EXPIRED") {
      reasons.push(input.expiryLabel ? `Expired ${input.expiryLabel}` : "Sertifikat/kalibrasi expired");
    } else {
      reasons.push("Tanggal sertifikat/kalibrasi tidak diketahui");
    }
  }

  if (input.condition !== "ACTIVE") {
    const condLabel: Record<PhysicalCondition, string> = {
      ACTIVE: "Aktif",
      BREAKDOWN: "Kondisi Breakdown",
      REPAIR: "Sedang Diperbaiki",
      MISSING: "Hilang",
      SCRAP: "Sudah Scrap",
      BACKUP: "Status Cadangan",
      UNKNOWN: "Kondisi fisik tidak diketahui",
    };
    reasons.push(condLabel[input.condition]);
  }

  const check = (input.lastCheckResult ?? "").toUpperCase();
  const checkOk =
    check === "" || check === "OK" || check === "RFU" || check === "OKE";
  if (!checkOk) {
    reasons.push(`Hasil cek terakhir: ${input.lastCheckResult}`);
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export function mapVerificationToCondition(result: VerificationResult): PhysicalCondition {
  switch (result) {
    case "MISSING":
      return "MISSING";
    case "REPLACE":
      return "REPAIR";
    case "BACKUP":
      return "BACKUP";
    case "AT_VENDOR":
      return "REPAIR";
    default:
      return "ACTIVE";
  }
}

/** Map registry remark/status text to a physical condition. */
export function mapRegistryCondition(
  status: string | undefined,
  remark: string | undefined,
): PhysicalCondition {
  const r = (remark ?? "").toUpperCase();
  const s = (status ?? "").toUpperCase();
  if (r.includes("BREAKDOWN")) return "BREAKDOWN";
  if (r.includes("AKTUAL TIDAK ADA")) return "MISSING";
  if (s === "SCRAP") return "SCRAP";
  if (s === "EXPIRED") return "ACTIVE"; // expiry handled via compliance, not condition
  if (s === "AKTIF" || s === "") return "ACTIVE";
  return "ACTIVE";
}

export interface TorqueDeviation {
  target?: number;
  deviationPct?: number;
  marginPct?: number;
}

export function torqueDeviation(session: TorqueSession): TorqueDeviation {
  if (session.min === undefined || session.max === undefined || session.rangeInvalid) {
    return {};
  }
  const readings = session.readings.filter((r): r is number => r !== null);
  if (readings.length === 0) return {};
  const target = (session.min + session.max) / 2;
  const mean = readings.reduce((a, b) => a + b, 0) / readings.length;
  const range = session.max - session.min;
  const deviationPct = ((mean - target) / target) * 100;
  // Closest reading distance to nearest boundary, as % of range.
  let minMargin = Infinity;
  for (const r of readings) {
    const distToMin = r - session.min;
    const distToMax = session.max - r;
    const nearest = Math.min(distToMin, distToMax);
    if (nearest < minMargin) minMargin = nearest;
  }
  const marginPct = range > 0 ? (minMargin / range) * 100 : 0;
  return { target, deviationPct, marginPct };
}
