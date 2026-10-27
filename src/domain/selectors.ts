import type {
  Asset,
  ComplianceStatus,
  DomainModel,
  TorqueSession,
  VerificationResult,
} from "./types";
import { torqueCompliance, torqueDeviation } from "./rules";
import { DRIFT_MARGIN_PCT } from "@/config/thresholds";

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
