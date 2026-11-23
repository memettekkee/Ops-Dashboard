import type {
  Asset,
  CalibrationStatus,
  VerificationRecord,
  ComplianceStatus,
  DomainModel,
  TorqueSession,
  VerificationResult,
} from "./types";
import { torqueCompliance, torqueDeviation } from "./rules";
import { DRIFT_MARGIN_PCT } from "@/config/thresholds";
import { calibrationStatusFromResult } from "@/config/statusMaps";

export interface KpiSummary {
  total: number;
  compliantPct: number;
  expired: number;
  due30: number;
  repairMissing: number;
  expiredInUse: number;
}

export function kpiSummary(assets: Asset[]): KpiSummary {
  const total = assets.length;
  const compliant = assets.filter(
    (a) => a.compliance === "VALID" || a.compliance === "DUE_60" || a.compliance === "DUE_30",
  ).length;
  const expired = assets.filter((a) => a.compliance === "EXPIRED").length;
  const due30 = assets.filter((a) => a.compliance === "DUE_30").length;
  const repairMissing = assets.filter(
    (a) => a.condition === "REPAIR" || a.condition === "MISSING" || a.condition === "BREAKDOWN",
  ).length;
  const expiredInUse = assets.filter(
    (a) => a.compliance === "EXPIRED" && a.condition === "ACTIVE",
  ).length;
  return {
    total,
    compliantPct: total ? Math.round((compliant / total) * 100) : 0,
    expired,
    due30,
    repairMissing,
    expiredInUse,
  };
}

export function complianceComposition(assets: Asset[]): { status: ComplianceStatus; count: number }[] {
  const order: ComplianceStatus[] = ["VALID", "DUE_60", "DUE_30", "EXPIRED", "UNKNOWN"];
  return order
    .map((status) => ({ status, count: assets.filter((a) => a.compliance === status).length }))
    .filter((d) => d.count > 0);
}

export function compliancePerArea(assets: Asset[]): { area: string; pct: number; total: number }[] {
  const byArea = new Map<string, Asset[]>();
  for (const a of assets) {
    const area = a.area ?? "Lainnya";
    const arr = byArea.get(area) ?? [];
    arr.push(a);
    byArea.set(area, arr);
  }
  return [...byArea.entries()]
    .map(([area, list]) => {
      const ok = list.filter(
        (a) => a.compliance === "VALID" || a.compliance === "DUE_60" || a.compliance === "DUE_30",
      ).length;
      return { area, pct: list.length ? Math.round((ok / list.length) * 100) : 0, total: list.length };
    })
    .sort((a, b) => a.pct - b.pct);
}

export interface RunwayPoint {
  asset: Asset;
  monthIndex: number; // 0..11 from today's month
  date: Date;
}

export function expiryRunway(assets: Asset[], today: Date): RunwayPoint[] {
  const points: RunwayPoint[] = [];
  const base = new Date(today.getFullYear(), today.getMonth(), 1);
  for (const a of assets) {
    if (!a.expiryDate) continue;
    const mi =
      (a.expiryDate.getFullYear() - base.getFullYear()) * 12 +
      (a.expiryDate.getMonth() - base.getMonth());
    if (mi >= -1 && mi <= 12) {
      points.push({ asset: a, monthIndex: mi, date: a.expiryDate });
    }
  }
  return points;
}

export function expiryByMonth(
  assets: Asset[],
  today: Date,
): { period: string; label: string; lifting: number; measuring: number; torque: number }[] {
  const base = new Date(today.getFullYear(), today.getMonth(), 1);
  const buckets: { period: string; label: string; lifting: number; measuring: number; torque: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    buckets.push({
      period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" }),
      lifting: 0,
      measuring: 0,
      torque: 0,
    });
  }
  for (const a of assets) {
    if (!a.expiryDate) continue;
    const mi =
      (a.expiryDate.getFullYear() - base.getFullYear()) * 12 +
      (a.expiryDate.getMonth() - base.getMonth());
    if (mi >= 0 && mi < 12) {
      const b = buckets[mi];
      if (a.controlType === "LIFTING") b.lifting++;
      else if (a.controlType === "MEASURING") b.measuring++;
      else b.torque++;
    }
  }
  return buckets;
}

export function actionItems(assets: Asset[]): Asset[] {
  const urgent = (a: Asset) =>
    a.compliance === "EXPIRED" || a.compliance === "DUE_30";
  const rank = (a: Asset): number => {
    if (a.compliance === "EXPIRED" && a.condition === "ACTIVE") return 0;
    if (a.compliance === "EXPIRED") return 1;
    if (a.compliance === "DUE_30") return 2;
    return 3;
  };
  return assets
    .filter(urgent)
    .sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return (a.daysToExpiry ?? 9999) - (b.daysToExpiry ?? 9999);
    });
}

// ---- Measuring ----

export function verificationByMonth(model: DomainModel): {
  period: string;
  okPct: number | null;
  total: number;
}[] {
  const byPeriod = new Map<string, VerificationResult[]>();
  for (const v of model.verifications) {
    const arr = byPeriod.get(v.period) ?? [];
    arr.push(v.result);
    byPeriod.set(v.period, arr);
  }
  return [...byPeriod.keys()].sort().map((period) => {
    const results = byPeriod.get(period)!;
    const withData = results.filter((r) => r !== "NO_DATA");
    const ok = results.filter((r) => r === "OK").length;
    return {
      period,
      okPct: withData.length ? Math.round((ok / withData.length) * 100) : null,
      total: results.length,
    };
  });
}

export interface HeatmapRow {
  assetId: string;
  cells: Record<string, VerificationResult>;
  problemCount: number;
}

export function verificationHeatmap(model: DomainModel): { periods: string[]; rows: HeatmapRow[] } {
  const periods = [...new Set(model.verifications.map((v) => v.period))].sort();
  const byAsset = new Map<string, Record<string, VerificationResult>>();
  for (const v of model.verifications) {
    const row = byAsset.get(v.assetId) ?? {};
    row[v.period] = v.result;
    byAsset.set(v.assetId, row);
  }
  const rows: HeatmapRow[] = [...byAsset.entries()].map(([assetId, cells]) => {
    const problemCount = Object.values(cells).filter(
      (r) => r === "NOT_OK" || r === "DUE_CALIBRATION" || r === "REPLACE" || r === "MISSING",
    ).length;
    return { assetId, cells, problemCount };
  });
  rows.sort((a, b) => b.problemCount - a.problemCount || a.assetId.localeCompare(b.assetId));
  return { periods, rows };
}

// ---- Torque ----

export interface BayCell {
  bay: string;
  byNominal: Record<number, { ready: number; total: number }>;
}

const BAY_ORDER = [
  "Bay 1", "Bay 2", "Bay 3", "Bay 4", "Bay 5", "Bay 6",
  "Bay 7", "Bay 8", "Bay 9", "Bay 10", "Bay 11", "Bay 12",
  "Tool Room", "Test Bench PT", "Dyno Test",
];

export function bayMap(model: DomainModel, today: Date): { bays: string[]; nominals: number[]; cells: BayCell[] } {
  // Latest session per asset.
  const latestByAsset = new Map<string, TorqueSession>();
  for (const s of model.torqueSessions) {
    const cur = latestByAsset.get(s.assetId);
    if (!cur || s.period > cur.period || (s.period === cur.period && s.sessionIndex > cur.sessionIndex)) {
      latestByAsset.set(s.assetId, s);
    }
  }
  const nominals = [...new Set(model.torqueSessions.map((s) => s.nominalNm).filter((n): n is number => n !== undefined))].sort((a, b) => a - b);
  const byBay = new Map<string, BayCell>();
  for (const s of latestByAsset.values()) {
    const bay = s.location ?? "Lainnya";
    const nm = s.nominalNm;
    if (nm === undefined) continue;
    const cell = byBay.get(bay) ?? { bay, byNominal: {} };
    const slot = cell.byNominal[nm] ?? { ready: 0, total: 0 };
    slot.total++;
    const { compliance } = torqueCompliance(s, today);
    if (compliance === "VALID") slot.ready++;
    cell.byNominal[nm] = slot;
    byBay.set(bay, cell);
  }
  const bays = [...byBay.keys()].sort((a, b) => {
    const ia = BAY_ORDER.indexOf(a);
    const ib = BAY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  return { bays, nominals, cells: bays.map((b) => byBay.get(b)!) };
}

export function torqueControlSeries(model: DomainModel, assetId: string): {
  period: string;
  readings: (number | null)[];
  min?: number;
  max?: number;
  target?: number;
}[] {
  const sessions = model.torqueSessions
    .filter((s) => s.assetId === assetId)
    .sort((a, b) => a.period.localeCompare(b.period) || a.sessionIndex - b.sessionIndex);
  return sessions.map((s) => ({
    period: s.period,
    readings: s.readings,
    min: s.min,
    max: s.max,
    target: s.min !== undefined && s.max !== undefined ? (s.min + s.max) / 2 : undefined,
  }));
}

export function torqueDriftFlags(model: DomainModel): Set<string> {
  // Flag asset as drifting if marginPct < threshold for 2 consecutive months.
  const byAsset = new Map<string, TorqueSession[]>();
  for (const s of model.torqueSessions) {
    const arr = byAsset.get(s.assetId) ?? [];
    arr.push(s);
    byAsset.set(s.assetId, arr);
  }
  const flags = new Set<string>();
  for (const [id, list] of byAsset) {
    const byPeriod = [...list].sort((a, b) => a.period.localeCompare(b.period));
    let streak = 0;
    for (const s of byPeriod) {
      const d = torqueDeviation(s);
      if (d.marginPct !== undefined && d.marginPct < DRIFT_MARGIN_PCT) {
        streak++;
        if (streak >= 2) {
          flags.add(id);
          break;
        }
      } else {
        streak = 0;
      }
    }
  }
  return flags;
}

export interface TorqueKpi {
  total: number;
  passThisMonth: number;
  failRepair: number;
  drift: number;
  overdue: number;
}

export function torqueKpi(model: DomainModel, today: Date): TorqueKpi {
  const ids = new Set(model.torqueSessions.map((s) => s.assetId));
  const latest = new Map<string, TorqueSession>();
  for (const s of model.torqueSessions) {
    const cur = latest.get(s.assetId);
    if (!cur || s.period > cur.period || (s.period === cur.period && s.sessionIndex > cur.sessionIndex)) {
      latest.set(s.assetId, s);
    }
  }
  let pass = 0;
  let fail = 0;
  let overdue = 0;
  for (const s of latest.values()) {
    const { compliance } = torqueCompliance(s, today);
    if (compliance === "VALID") pass++;
    else if (compliance === "EXPIRED") fail++;
    else if (compliance === "DUE_30") overdue++;
  }
  return {
    total: ids.size,
    passThisMonth: pass,
    failRepair: fail,
    drift: torqueDriftFlags(model).size,
    overdue,
  };
}

// ---- rev1: calibration status per period ----
export const CAL_STATUS_ORDER: CalibrationStatus[] = [
  "CALIBRATED",
  "NEED_CALIBRATION",
  "ON_PROGRESS",
  "DAMAGE",
  "UNKNOWN",
];

export type StatusOrNone = CalibrationStatus | "NONE";

/** v2 records carry the status; v1 results are mapped to the closest status. */
export function recordStatus(v: VerificationRecord): CalibrationStatus {
  return v.calibrationStatus ?? calibrationStatusFromResult(v.result);
}

export function measuringPeriods(model: DomainModel): string[] {
  return [...new Set(model.verifications.map((v) => v.period))].sort();
}

export function isV2Period(model: DomainModel, period: string): boolean {
  return model.verifications.some((v) => v.period === period && v.format === "v2");
}

export function statusByAsset(model: DomainModel, period: string): Map<string, CalibrationStatus> {
  const m = new Map<string, CalibrationStatus>();
  for (const v of model.verifications) if (v.period === period) m.set(v.assetId, recordStatus(v));
  return m;
}

export interface StatusTransitions {
  cells: Map<string, string[]>; // `${from}>${to}` -> asset ids
}

export function statusTransitions(model: DomainModel, from: string, to: string): StatusTransitions {
  const a = statusByAsset(model, from);
  const b = statusByAsset(model, to);
  const cells = new Map<string, string[]>();
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const k = `${a.get(id) ?? "NONE"}>${b.get(id) ?? "NONE"}`;
    cells.set(k, [...(cells.get(k) ?? []), id]);
  }
  for (const list of cells.values()) list.sort();
  return { cells };
}

const RANK: Record<StatusOrNone, number> = {
  CALIBRATED: 3,
  ON_PROGRESS: 2,
  NEED_CALIBRATION: 1,
  UNKNOWN: 0.5,
  DAMAGE: 0,
  NONE: -1,
};

export interface ChangeSummary {
  from?: string;
  to?: string;
  improved: string[];
  worsened: string[];
  added: string[];
  removed: string[];
}

/** Compare the two most recent measuring periods. */
export function changeSummary(model: DomainModel): ChangeSummary {
  const periods = measuringPeriods(model);
  const out: ChangeSummary = { improved: [], worsened: [], added: [], removed: [] };
  if (periods.length < 2) return out;
  out.from = periods[periods.length - 2];
  out.to = periods[periods.length - 1];
  const { cells } = statusTransitions(model, out.from, out.to);
  for (const [k, ids] of cells) {
    const [f, t] = k.split(">") as [StatusOrNone, StatusOrNone];
    if (f === t) continue;
    if (f === "NONE") out.added.push(...ids);
    else if (t === "NONE") out.removed.push(...ids);
    else if (RANK[t] > RANK[f]) out.improved.push(...ids);
    else out.worsened.push(...ids);
  }
  return out;
}

export interface VendorGroup {
  po: string;
  assets: Asset[];
}

/** Measuring tools being calibrated by a vendor, grouped by PO number. */
export function vendorGroups(assets: Asset[]): VendorGroup[] {
  const by = new Map<string, Asset[]>();
  for (const a of assets) {
    if (a.calibrationStatus !== "ON_PROGRESS") continue;
    const po = a.poNumber ?? "Tanpa PO";
    by.set(po, [...(by.get(po) ?? []), a]);
  }
  return [...by.entries()]
    .map(([po, list]) => ({ po, assets: list.sort((x, y) => x.id.localeCompare(y.id)) }))
    .sort((a, b) => b.assets.length - a.assets.length);
}

/** Stacked-bar data: per measuring category, count per calibration status. */
export function categoryStatusCounts(
  assets: Asset[],
): { category: string; total: number; counts: Record<CalibrationStatus, number> }[] {
  const by = new Map<string, Record<CalibrationStatus, number>>();
  for (const a of assets) {
    const cat = a.measuringCategory ?? "Lainnya";
    const row = by.get(cat) ?? { CALIBRATED: 0, NEED_CALIBRATION: 0, ON_PROGRESS: 0, DAMAGE: 0, UNKNOWN: 0 };
    row[a.calibrationStatus ?? "UNKNOWN"]++;
    by.set(cat, row);
  }
  return [...by.entries()]
    .map(([category, counts]) => ({
      category,
      counts,
      total: Object.values(counts).reduce((x, y) => x + y, 0),
    }))
    .sort((a, b) => b.total - a.total);
}

/** Torque wrenches (incl. those without monthly sessions). */
export function torqueAssetStats(assets: Asset[]) {
  const t = assets.filter((a) => a.controlType === "TORQUE");
  return {
    total: t.length,
    noMonthly: t.filter((a) => !a.hasMonthlyCheck).length,
  };
}

export interface ReconciliationRow {
  kind: "ID_CONFLICT" | "MISSING_IN_LATEST" | "NEW";
  fileSide: string;
  verifSide: string;
  note: string;
}

/** Rows for the torque "Rekonsiliasi ID" panel: conflicts, missing wrenches and new wrenches. */
export function torqueReconciliation(model: DomainModel): ReconciliationRow[] {
  const cap = (id: string) => {
    const a = model.assets.find((x) => x.id === id);
    return a?.capacityLabel ? `${id} (${a.capacityLabel})` : id;
  };
  const rows: ReconciliationRow[] = [];
  const conflicted = new Set<string>();
  for (const i of model.issues) {
    if (i.type === "ID_CONFLICT" && i.assetId) {
      conflicted.add(i.assetId);
      rows.push({
        kind: "ID_CONFLICT",
        fileSide: (i.relatedAssetIds ?? []).map(cap).join(", ") || "—",
        verifSide: cap(i.assetId),
        note: i.message,
      });
    } else if (i.type === "MISSING_IN_LATEST" && i.assetId?.startsWith("TW-")) {
      rows.push({ kind: "MISSING_IN_LATEST", fileSide: cap(i.assetId), verifSide: "—", note: i.message });
    }
  }
  for (const a of model.assets) {
    if (a.controlType === "TORQUE" && !a.hasMonthlyCheck && !conflicted.has(a.id)) {
      rows.push({
        kind: "NEW",
        fileSide: "—",
        verifSide: cap(a.id),
        note: "Torque wrench baru di data verifikasi; belum ada cek bulanan.",
      });
    }
  }
  return rows;
}
