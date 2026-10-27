import { format } from "date-fns";
import type {
  Asset,
  DataIssue,
  DomainModel,
  MeasuringCalibration,
  TorqueSession,
  VerificationRecord,
} from "./types";
import type { Row } from "@/parsers/shared";
import { controlTypeFromId, issueId } from "@/parsers/shared";
import { parseSertifikasi, type DataSheetRow, type RawDataRow } from "@/parsers/sertifikasi";
import { parseVerifikasi } from "@/parsers/verifikasi";
import { parseTorque } from "@/parsers/torque";
import { locationToArea } from "@/config/locations";
import {
  complianceFromDays,
  computeUsable,
  daysToExpiry,
  estimateMeasuringExpiry,
  mapRegistryCondition,
  mapVerificationToCondition,
  torqueCompliance,
} from "./rules";
import { VERIFICATION_LABEL } from "@/config/statusMaps";

export type SheetBook = Record<string, Row[]>;

export interface RawBooks {
  sertifikasi?: SheetBook;
  verifikasi?: SheetBook;
  torque?: SheetBook;
}

function fmtDate(d?: Date): string | undefined {
  return d ? format(d, "d MMM yyyy") : undefined;
}

function swlLabel(ton: number | null | undefined): string | undefined {
  return ton === null || ton === undefined ? undefined : `${ton} Ton`;
}

/** Latest record by checkedAt / period from a list. */
function latestByPeriod<T extends { period: string; checkedAt?: Date }>(list: T[]): T | undefined {
  if (list.length === 0) return undefined;
  return [...list].sort((a, b) => {
    if (a.period !== b.period) return a.period < b.period ? 1 : -1;
    const at = a.checkedAt?.getTime() ?? 0;
    const bt = b.checkedAt?.getTime() ?? 0;
    return bt - at;
  })[0];
}

function buildLiftingAssets(
  rawData: RawDataRow[],
  dataSheet: DataSheetRow[],
  today: Date,
  issues: DataIssue[],
): Asset[] {
  const dataById = new Map(dataSheet.map((d) => [d.id, d]));
  const rawById = new Map(rawData.map((r) => [r.id, r]));
  const allIds = new Set<string>([...rawById.keys(), ...dataById.keys()]);
  const assets: Asset[] = [];

  for (const id of allIds) {
    // Skip ids that belong to measuring/torque families; lifting registry may contain them.
    const ct = controlTypeFromId(id);
    if (ct === "TORQUE") continue;

    const raw = rawById.get(id);
    const reg = dataById.get(id);
    const sources: string[] = [];
    if (raw) sources.push("RAW DATA");
    if (reg) sources.push("DATA");

    if (!raw && reg) {
      issues.push({
        id: issueId(),
        severity: "low",
        type: "MISSING_IN_REGISTRY",
        assetId: id,
        source: `sertifikasi-peralatan.xlsx › DATA`,
        message: `Aset ${id} ada di DATA tapi tidak ada di RAW DATA.`,
      });
    } else if (raw && !reg) {
      issues.push({
        id: issueId(),
        severity: "low",
        type: "MISSING_IN_REGISTRY",
        assetId: id,
        source: `sertifikasi-peralatan.xlsx › RAW DATA`,
        message: `Aset ${id} ada di RAW DATA tapi tidak terdaftar di DATA.`,
      });
    }

    const expiryDate = raw?.expiryDate ?? reg?.expiryDateAlt;

    // Expiry conflict detection
    if (raw?.expiryDate && reg?.expiryDateAlt) {
      if (raw.expiryDate.getTime() !== reg.expiryDateAlt.getTime()) {
        issues.push({
          id: issueId(),
          severity: "medium",
          type: "EXPIRY_CONFLICT",
          assetId: id,
          source: `sertifikasi-peralatan.xlsx › RAW DATA / DATA`,
          message: `Tanggal expire ${id} berbeda: RAW DATA ${fmtDate(raw.expiryDate)}, DATA ${fmtDate(reg.expiryDateAlt)}. Dipakai nilai RAW DATA.`,
        });
      }
    }

    const dte = daysToExpiry(expiryDate, today);
    const compliance = complianceFromDays(dte);
    const condition = mapRegistryCondition(
      reg?.registryStatus ?? undefined,
      reg?.remark ?? undefined,
    );
    const location = raw?.location ?? reg?.location ?? undefined;
    const regPrPo = [reg?.lastPr, reg?.lastPo].filter(Boolean).join(" / ") || undefined;
    const prPo = raw?.lastPrPo ?? (regPrPo === "" ? undefined : regPrPo);

    if (!expiryDate) {
      issues.push({
        id: issueId(),
        severity: "medium",
        type: "NO_EXPIRY",
        assetId: id,
        source: `sertifikasi-peralatan.xlsx`,
        message: `Aset ${id} tidak punya tanggal expire.`,
      });
    }

    const usable = computeUsable({
      compliance,
      condition,
      expiryLabel: fmtDate(expiryDate),
    });

    if (compliance === "EXPIRED" && condition === "ACTIVE") {
      issues.push({
        id: issueId(),
        severity: "high",
        type: "EXPIRED_BUT_IN_USE",
        assetId: id,
        source: `sertifikasi-peralatan.xlsx`,
        message: `Sertifikat ${id} expired (${fmtDate(expiryDate)}) tetapi aset masih berstatus aktif.`,
      });
    }

    assets.push({
      id,
      name: reg?.name ?? raw?.category ?? id,
      controlType: "LIFTING",
      category: raw?.category ?? reg?.category ?? "LAINNYA",
      brand: reg?.brand ?? undefined,
      location: location ?? undefined,
      area: locationToArea(location ?? null),
      capacityLabel: swlLabel(raw?.swlTon ?? reg?.swlTon) ?? reg?.size ?? undefined,
      vendor: raw?.vendor ?? undefined,
      expiryDate,
      lastInspection: raw?.lastInspection ?? reg?.lastInspection ?? undefined,
      compliance,
      daysToExpiry: dte,
      condition,
      usable,
      sources,
      prPo: prPo ?? undefined,
      processStage: raw?.processStage ?? undefined,
    });
  }
  return assets;
}

function buildMeasuringAssets(
  calibrations: MeasuringCalibration[],
  verifications: VerificationRecord[],
  today: Date,
): Asset[] {
  const calById = new Map(calibrations.map((c) => [c.assetId, c]));
  const verByAsset = new Map<string, VerificationRecord[]>();
  for (const v of verifications) {
    const arr = verByAsset.get(v.assetId) ?? [];
    arr.push(v);
    verByAsset.set(v.assetId, arr);
  }
  const allIds = new Set<string>([...calById.keys(), ...verByAsset.keys()]);
  const assets: Asset[] = [];

  for (const id of allIds) {
    const cal = calById.get(id);
    const vers = verByAsset.get(id) ?? [];
    const latest = latestByPeriod(vers);

    let expiryDate = cal?.expiryDate;
    let expiryIsEstimated = false;
    if (!expiryDate) {
      const lastCal = vers
        .map((v) => v.lastCalibration)
        .filter((d): d is Date => d instanceof Date)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const est = estimateMeasuringExpiry(lastCal);
      if (est) {
        expiryDate = est;
        expiryIsEstimated = true;
      }
    }

    const dte = daysToExpiry(expiryDate, today);
    const compliance = complianceFromDays(dte);
    const condition = latest ? mapVerificationToCondition(latest.result) : "UNKNOWN";

    const usable = computeUsable({
      compliance,
      condition,
      lastCheckResult: latest?.result === "OK" ? "OK" : latest?.result,
      expiryLabel: fmtDate(expiryDate),
    });

    const sources: string[] = [];
    if (cal) sources.push("ALAT UKUR");
    if (vers.length) sources.push("verifikasi");

    assets.push({
      id,
      name: id,
      controlType: "MEASURING",
      category: "ALAT UKUR",
      brand: undefined,
      vendor: cal?.vendor,
      expiryDate,
      expiryIsEstimated,
      compliance,
      daysToExpiry: dte,
      condition,
      lastCheck: latest
        ? { date: latest.checkedAt, result: VERIFICATION_LABEL[latest.result], period: latest.period }
        : undefined,
      usable,
      sources,
      prPo: cal?.po,
    });
  }
  return assets;
}

function buildTorqueAssets(sessions: TorqueSession[], today: Date): Asset[] {
  const byId = new Map<string, TorqueSession[]>();
  for (const s of sessions) {
    const arr = byId.get(s.assetId) ?? [];
    arr.push(s);
    byId.set(s.assetId, arr);
  }
  const assets: Asset[] = [];
  for (const [id, list] of byId) {
    const latest = [...list].sort((a, b) => {
      if (a.period !== b.period) return a.period < b.period ? 1 : -1;
      return b.sessionIndex - a.sessionIndex;
    })[0];
    const { compliance } = torqueCompliance(latest, today);
    const nominal = list.map((s) => s.nominalNm).find((n) => n !== undefined);
    const location = latest?.location;
    const usable = computeUsable({
      compliance,
      condition: "ACTIVE",
      lastCheckResult:
        latest?.detailStatus?.toUpperCase() === "REPAIR"
          ? "REPAIR"
          : latest?.overall === "NOT_OK"
            ? "NOT OK"
            : "OK",
    });
    assets.push({
      id,
      name: id,
      controlType: "TORQUE",
      category: nominal ? `TORQUE WRENCH ${nominal} NM` : "TORQUE WRENCH",
      capacityLabel: nominal ? `${nominal} Nm` : undefined,
      location: location ?? undefined,
      area: locationToArea(location ?? null),
      compliance,
      condition: "ACTIVE",
      lastCheck: latest
        ? { date: latest.checkedAt, result: latest.overall, period: latest.period }
        : undefined,
      usable,
      sources: ["torque"],
    });
  }
  return assets;
}

export function buildDomainModel(books: RawBooks, today: Date = new Date()): DomainModel {
  const issues: DataIssue[] = [];

  const sert = books.sertifikasi
    ? parseSertifikasi(books.sertifikasi)
    : { data: { rawData: [], dataSheet: [], certifications: [], calibrations: [] }, issues: [] };
  const verif = books.verifikasi
    ? parseVerifikasi(books.verifikasi)
    : { data: [], issues: [] };
  const torq = books.torque ? parseTorque(books.torque) : { data: [], issues: [] };

  issues.push(...sert.issues, ...verif.issues, ...torq.issues);

  const lifting = buildLiftingAssets(sert.data.rawData, sert.data.dataSheet, today, issues);
  const measuring = buildMeasuringAssets(sert.data.calibrations, verif.data, today);
  const torque = buildTorqueAssets(torq.data, today);

  return {
    assets: [...lifting, ...measuring, ...torque],
    certifications: sert.data.certifications,
    calibrations: sert.data.calibrations,
    verifications: verif.data,
    torqueSessions: torq.data,
    issues,
    dataAsOf: format(today, "yyyy-MM-dd"),
  };
}
