export type ControlType = "LIFTING" | "MEASURING" | "TORQUE";

export type ComplianceStatus =
  | "VALID"
  | "DUE_60"
  | "DUE_30"
  | "EXPIRED"
  | "UNKNOWN";

export type PhysicalCondition =
  | "ACTIVE"
  | "BREAKDOWN"
  | "REPAIR"
  | "MISSING"
  | "SCRAP"
  | "BACKUP"
  | "UNKNOWN";

export type VerificationResult =
  | "OK"
  | "NOT_OK"
  | "DUE_CALIBRATION"
  | "BACKUP"
  | "AT_VENDOR"
  | "REPLACE"
  | "MISSING"
  | "NO_DATA"
  | "UNKNOWN";

export type UsableVerdict =
  | { ok: true }
  | { ok: false; reasons: string[] };

export interface Asset {
  id: string;
  name: string;
  controlType: ControlType;
  category: string;
  brand?: string;
  location?: string;
  area?: string;
  capacityLabel?: string;
  vendor?: string;
  expiryDate?: Date;
  expiryIsEstimated?: boolean;
  lastInspection?: Date;
  compliance: ComplianceStatus;
  daysToExpiry?: number;
  condition: PhysicalCondition;
  lastCheck?: { date?: Date; result: string; period: string };
  usable: UsableVerdict;
  sources: string[];
  prPo?: string;
  processStage?: string;
}

export interface CertificationRecord {
  assetId: string;
  certificateNo?: string;
  lastInspection?: Date;
  expiryDate?: Date;
  vendor?: string;
  processStage?: string;
  prPo?: string;
}

export interface MeasuringCalibration {
  assetId: string;
  expiryDate?: Date;
  vendor?: string;
  po?: string;
  poStatus?: "OPEN" | "CLOSE";
  sentToVendorAt?: Date;
  returnedFromVendorAt?: Date;
  batch?: number;
  remark?: string;
}

export interface VerificationRecord {
  assetId: string;
  period: string; // "2026-10"
  checkedAt?: Date;
  result: VerificationResult;
  remark?: string;
  lastCalibration?: Date | null;
}

export interface TorqueSession {
  assetId: string;
  period: string; // "2026-08"
  sessionIndex: number;
  location?: string;
  unitLabel?: string;
  checkedAt?: Date;
  nominalNm?: number;
  min?: number;
  max?: number;
  readings: (number | null)[];
  overall: "OK" | "NOT_OK" | "NO_DATA";
  detailStatus?: string;
  rangeInvalid: boolean;
  inspectedBy?: string;
}

export type DataIssueType =
  | "EXPIRY_CONFLICT"
  | "MISSING_IN_REGISTRY"
  | "NO_EXPIRY"
  | "UNKNOWN_LAST_CALIBRATION"
  | "EXPIRED_BUT_IN_USE"
  | "INVALID_RANGE"
  | "DUPLICATE_ID_USAGE"
  | "MISSING_PERIOD"
  | "EMPTY_RESULTS"
  | "UNMAPPED_VALUE"
  | "INVALID_ID";

export interface DataIssue {
  id: string;
  severity: "high" | "medium" | "low";
  type: DataIssueType;
  assetId?: string;
  source: string;
  message: string;
}

/** Everything the UI needs, produced by the parse pipeline. */
export interface DomainModel {
  assets: Asset[];
  certifications: CertificationRecord[];
  calibrations: MeasuringCalibration[];
  verifications: VerificationRecord[];
  torqueSessions: TorqueSession[];
  issues: DataIssue[];
  dataAsOf?: string; // ISO date string
}

export interface ParseResult<T> {
  data: T;
  issues: DataIssue[];
}
