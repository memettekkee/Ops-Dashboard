import type { CalibrationStatus, ComplianceStatus, VerificationResult } from "@/domain/types";

export const COMPLIANCE_LABEL: Record<ComplianceStatus, string> = {
  VALID: "Berlaku",
  DUE_60: "Jatuh Tempo ≤60 hari",
  DUE_30: "Jatuh Tempo ≤30 hari",
  EXPIRED: "Expired",
  UNKNOWN: "Tidak Diketahui",
};

/** Label override for torque wrench context (no expiry date). */
export const TORQUE_COMPLIANCE_LABEL: Record<ComplianceStatus, string> = {
  VALID: "Lolos",
  DUE_60: "Perlu Dicek",
  DUE_30: "Cek Bulanan Terlewat",
  EXPIRED: "Tidak Lolos",
  UNKNOWN: "Belum Dicek",
};

/** CSS variable token name used for each compliance status. */
export const COMPLIANCE_TOKEN: Record<ComplianceStatus, string> = {
  VALID: "var(--status-ok)",
  DUE_60: "var(--status-warn)",
  DUE_30: "var(--status-urgent)",
  EXPIRED: "var(--status-danger)",
  UNKNOWN: "var(--status-muted)",
};

export const VERIFICATION_LABEL: Record<VerificationResult, string> = {
  OK: "OK",
  NOT_OK: "Tidak OK",
  DUE_CALIBRATION: "Perlu Kalibrasi",
  BACKUP: "Cadangan",
  AT_VENDOR: "Di Vendor",
  REPLACE: "Perlu Diganti",
  MISSING: "Hilang",
  NO_DATA: "Belum Dicek",
  UNKNOWN: "Tidak Dikenal",
};

export const VERIFICATION_TOKEN: Record<VerificationResult, string> = {
  OK: "var(--status-ok)",
  NOT_OK: "var(--status-danger)",
  DUE_CALIBRATION: "var(--status-urgent)",
  BACKUP: "var(--status-info)",
  AT_VENDOR: "var(--status-info)",
  REPLACE: "var(--status-danger)",
  MISSING: "var(--status-danger)",
  NO_DATA: "var(--status-muted)",
  UNKNOWN: "var(--status-muted)",
};

/** Maps a raw result string from the verification sheet to the enum. */
export function mapVerificationResult(raw: unknown): {
  result: VerificationResult;
  unmapped: boolean;
} {
  if (raw === null || raw === undefined) return { result: "NO_DATA", unmapped: false };
  const s = String(raw).trim().toUpperCase();
  if (s === "" || s === "-") return { result: "NO_DATA", unmapped: false };
  switch (s) {
    case "OK":
    case "OKE":
      return { result: "OK", unmapped: false };
    case "NOT OK":
    case "NOT OKE":
      return { result: "NOT_OK", unmapped: false };
    case "PREPARE FOR CALIBRATION":
      return { result: "DUE_CALIBRATION", unmapped: false };
    case "TEMPORARY FOR BACK UP":
      return { result: "BACKUP", unmapped: false };
    case "SEND TO VENDOR":
      return { result: "AT_VENDOR", unmapped: false };
    case "REPLACE":
      return { result: "REPLACE", unmapped: false };
    case "MISSING":
      return { result: "MISSING", unmapped: false };
    default:
      return { result: "UNKNOWN", unmapped: true };
  }
}

export const CALIBRATION_STATUS_LABEL: Record<CalibrationStatus, string> = {
  CALIBRATED: "Terkalibrasi",
  NEED_CALIBRATION: "Perlu Kalibrasi",
  ON_PROGRESS: "Proses Kalibrasi (di vendor/PO)",
  DAMAGE: "Rusak",
  UNKNOWN: "Tidak Dikenal",
};

export const CALIBRATION_STATUS_TOKEN: Record<CalibrationStatus, string> = {
  CALIBRATED: "var(--status-ok)",
  NEED_CALIBRATION: "var(--status-urgent)",
  ON_PROGRESS: "var(--status-info)",
  DAMAGE: "var(--status-danger)",
  UNKNOWN: "var(--status-muted)",
};

/** Maps raw `Status` column of the v2 verification sheet. */
export function mapCalibrationStatus(raw: unknown): { status: CalibrationStatus; unmapped: boolean } {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  switch (s) {
    case "CALIBRATED":
      return { status: "CALIBRATED", unmapped: false };
    case "NEED CALIBRATION":
      return { status: "NEED_CALIBRATION", unmapped: false };
    case "ON PROGRESS":
      return { status: "ON_PROGRESS", unmapped: false };
    case "DAMAGE":
      return { status: "DAMAGE", unmapped: false };
    default:
      return { status: "UNKNOWN", unmapped: true };
  }
}

/** Status used by period-to-period comparison; v1 results are mapped to the closest v2 status. */
export function calibrationStatusFromResult(r: VerificationResult): CalibrationStatus {
  switch (r) {
    case "OK":
      return "CALIBRATED";
    case "DUE_CALIBRATION":
      return "NEED_CALIBRATION";
    case "AT_VENDOR":
      return "ON_PROGRESS";
    case "NOT_OK":
    case "REPLACE":
    case "MISSING":
      return "DAMAGE";
    default:
      return "UNKNOWN";
  }
}
