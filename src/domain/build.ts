import { format } from "date-fns";
import type {
  Asset,
  DataIssue,
  DomainModel,
  MeasuringCalibration,
  TorqueSession,
  VerificationRecord,
  VerificationFileInfo,
  VerificationReportMeta,
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
  measuringStatusOverride,
  torqueKey,
  torqueNumber,
  torqueNominalFromId,
  mapRegistryCondition,
  mapVerificationToCondition,
  torqueCompliance,
} from "./rules";
import { VERIFICATION_LABEL } from "@/config/statusMaps";
import { measuringCategory, splitSerial } from "@/config/categories";

export type SheetBook = Record<string, Row[]>;

export interface RawBooks {
  sertifikasi?: SheetBook;
  /** Legacy single verification workbook. */
  verifikasi?: SheetBook;
  /** rev1: several verification workbooks; later entries win for the same (asset, period). */
  verifikasiFiles?: { name: string; book: SheetBook }[];
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

interface MeasuringCtx {
  latestPeriod?: string;
  periodCount: number;
}

const GENERIC_EXPIRED = "Sertifikat/kalibrasi expired";

function buildMeasuringAssets(
  calibrations: MeasuringCalibration[],
  verifications: VerificationRecord[],
  today: Date,
  ctx: MeasuringCtx,
  issues: DataIssue[],
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
    const v2 = latest?.format === "v2";
    const status = v2 ? latest?.calibrationStatus : undefined;

    let expiryDate = cal?.expiryDate;
    let expiryIsEstimated = false;
    if (v2 && status === "CALIBRATED" && latest?.lastCalibration) {
      const est = estimateMeasuringExpiry(latest.lastCalibration);
      if (est && (!expiryDate || est.getTime() > expiryDate.getTime())) {
        expiryDate = est;
        expiryIsEstimated = true;
      }
    }
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
    const override = measuringStatusOverride(status);
    const compliance = override.compliance ?? complianceFromDays(dte);
    const complianceReason: Asset["complianceReason"] = override.compliance
      ? "STATUS"
      : compliance === "EXPIRED"
        ? "DATE"
        : undefined;
    const condition = override.condition ?? (latest ? mapVerificationToCondition(latest.result) : "UNKNOWN");

    const usable = computeUsable({
      compliance,
      condition,
      lastCheckResult: latest?.result === "OK" ? "OK" : latest?.result,
      expiryLabel: fmtDate(expiryDate),
    });
    if (!usable.ok && complianceReason === "STATUS") {
      const replacement = status === "ON_PROGRESS" ? "Sedang proses kalibrasi di vendor" : "Perlu kalibrasi";
      usable.reasons = usable.reasons.map((r) => (r.startsWith("Expired") || r === GENERIC_EXPIRED ? replacement : r));
    }

    const named = [...vers].sort((a, b) => (a.period < b.period ? 1 : -1)).find((v) => v.name);
    const rawName = named?.name;
    const split = rawName ? splitSerial(rawName) : undefined;
    const brand = [...vers].sort((a, b) => (a.period < b.period ? 1 : -1)).find((v) => v.brand)?.brand;

    const firstPeriod = vers.map((v) => v.period).sort()[0];
    const isNewThisPeriod =
      !!ctx.latestPeriod && ctx.periodCount > 1 && firstPeriod === ctx.latestPeriod ? true : undefined;

    const poNumber = latest?.poNumber ?? cal?.po;
    const sources: string[] = [];
    if (cal) sources.push("ALAT UKUR");
    if (vers.length) sources.push("verifikasi");

    if (ctx.latestPeriod && latest && latest.period < ctx.latestPeriod) {
      issues.push({
        id: issueId(),
        severity: "medium",
        type: "MISSING_IN_LATEST",
        assetId: id,
        source: "verifikasi",
        message: `${id} ada di verifikasi ${latest.period} tetapi tidak ada di periode terbaru (${ctx.latestPeriod}).`,
      });
    }

    assets.push({
      id,
      name: split?.cleanName ?? id,
      controlType: "MEASURING",
      category: "ALAT UKUR",
      measuringCategory: measuringCategory(rawName),
      serialNumber: split?.serialNumber,
      brand,
      vendor: cal?.vendor,
      expiryDate,
      expiryIsEstimated,
      compliance,
      complianceReason,
      daysToExpiry: dte,
      condition,
      calibrationStatus: status,
      lastCalibration: latest?.lastCalibration ?? undefined,
      isNewThisPeriod,
      lastCheck: latest
        ? { date: latest.checkedAt, result: VERIFICATION_LABEL[latest.result], period: latest.period }
        : undefined,
      usable,
      sources,
      prPo: poNumber,
      poNumber,
    });
  }
  return assets;
}

function periodLabel(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return format(new Date(y, m - 1, 1), "MMM yyyy");
}

function latestRecord(list: VerificationRecord[]): VerificationRecord | undefined {
  return latestByPeriod(list);
}

function buildTorqueAssets(
  sessions: TorqueSession[],
  ext: VerificationRecord[],
  today: Date,
  issues: DataIssue[],
): { assets: Asset[]; sessions: TorqueSession[] } {
  const byId = new Map<string, TorqueSession[]>();
  for (const s of sessions) {
    const arr = byId.get(s.assetId) ?? [];
    arr.push(s);
    byId.set(s.assetId, arr);
  }
  const extById = new Map<string, VerificationRecord[]>();
  for (const r of ext) {
    const arr = extById.get(r.assetId) ?? [];
    arr.push(r);
    extById.set(r.assetId, arr);
  }
  const extLatest = new Map<string, VerificationRecord>();
  for (const [id, list] of extById) extLatest.set(id, latestRecord(list)!);

  const fileNominal = (list: TorqueSession[]) => list.map((s) => s.nominalNm).find((n) => n !== undefined);
  const fileKeyOf = new Map<string, string | null>();
  for (const [id, list] of byId) fileKeyOf.set(id, torqueKey(id, fileNominal(list)));
  const extIdByKey = new Map<string, string>();
  for (const id of extLatest.keys()) {
    const k = torqueKey(id);
    if (k) extIdByKey.set(k, id);
  }

  // Pair file wrenches with verification wrenches: same number AND same Nm only.
  const fileToExt = new Map<string, string>();
  const matchedExt = new Set<string>();
  for (const [fid, k] of fileKeyOf) {
    const eid = k ? extIdByKey.get(k) : undefined;
    if (eid) {
      fileToExt.set(fid, eid);
      matchedExt.add(eid);
    }
  }

  const latestExtPeriod = [...extLatest.values()].map((r) => r.period).sort().pop();
  const hasExt = extLatest.size > 0;

  // ID conflicts and missing wrenches.
  const unmatchedFile = [...byId.keys()].filter((id) => !fileToExt.has(id));
  const unmatchedExt = [...extLatest.keys()].filter((id) => !matchedExt.has(id));
  const extByNumber = new Map<string, string[]>();
  for (const id of unmatchedExt) {
    const n = torqueNumber(id);
    if (n) extByNumber.set(n, [...(extByNumber.get(n) ?? []), id]);
  }
  const conflictedExt = new Set<string>();
  for (const fid of unmatchedFile) {
    const n = torqueNumber(fid);
    const eids = n ? extByNumber.get(n) : undefined;
    if (!n || !eids || eids.length === 0) continue;
    const eid = eids[0];
    conflictedExt.add(eid);
    const fileNm = fileNominal(byId.get(fid)!) ?? torqueNominalFromId(fid);
    const extNm = torqueNominalFromId(eid);
    issues.push({
      id: issueId(),
      severity: "high",
      type: "ID_CONFLICT",
      assetId: eid,
      relatedAssetIds: [fid],
      source: "torque + verifikasi",
      message: `Nomor TW ${n}: di file torque tercatat ${fileNm ?? "?"} Nm, di data verifikasi ${latestExtPeriod ? periodLabel(latestExtPeriod) : ""} tercatat ${extNm ?? "?"} Nm. Konfirmasi ke admin apakah nomor di-reset atau salah ketik.`,
    });
  }
  const conflictedFile = new Set(
    unmatchedFile.filter((fid) => {
      const n = torqueNumber(fid);
      return n ? (extByNumber.get(n)?.length ?? 0) > 0 : false;
    }),
  );

  const assets: Asset[] = [];
  const outSessions: TorqueSession[] = [];

  const makeAsset = (
    id: string,
    fileId: string | undefined,
    list: TorqueSession[],
    extRec: VerificationRecord | undefined,
  ): Asset => {
    const latest = list.length
      ? [...list].sort((a, b) => {
          if (a.period !== b.period) return a.period < b.period ? 1 : -1;
          return b.sessionIndex - a.sessionIndex;
        })[0]
      : undefined;
    const { compliance } = torqueCompliance(latest, today);
    const nominal = fileNominal(list) ?? torqueNominalFromId(id) ?? undefined;
    const location = latest?.location;
    const usable = computeUsable({
      compliance,
      condition: "ACTIVE",
      lastCheckResult: !latest
        ? undefined
        : latest.detailStatus?.toUpperCase() === "REPAIR"
          ? "REPAIR"
          : latest.overall === "NOT_OK"
            ? "NOT OK"
            : "OK",
    });
    const reasons = usable.ok ? [] : [...usable.reasons];
    const hasMonthlyCheck = !!latest;
    const mapped = reasons.map((r) =>
      !hasMonthlyCheck && r.startsWith("Tanggal sertifikat") ? "Belum ada cek bulanan" : r,
    );
    const st = extRec?.calibrationStatus;
    if (st === "NEED_CALIBRATION") mapped.push("Kalibrasi eksternal: perlu kalibrasi");
    else if (st === "ON_PROGRESS") mapped.push("Kalibrasi eksternal: sedang proses di vendor");
    else if (st === "DAMAGE") mapped.push("Kalibrasi eksternal: rusak");
    const aliases = fileId && fileId !== id ? [fileId] : undefined;
    return {
      id,
      name: id,
      controlType: "TORQUE",
      category: nominal ? `TORQUE WRENCH ${nominal} NM` : "TORQUE WRENCH",
      capacityLabel: nominal ? `${nominal} Nm` : undefined,
      brand: extRec?.brand,
      location: location ?? undefined,
      area: locationToArea(location ?? null),
      compliance,
      condition: "ACTIVE",
      lastCheck: latest ? { date: latest.checkedAt, result: latest.overall, period: latest.period } : undefined,
      usable: mapped.length === 0 ? { ok: true } : { ok: false, reasons: mapped },
      sources: [...(latest ? ["torque"] : []), ...(extRec ? ["verifikasi"] : [])],
      aliases,
      hasMonthlyCheck,
      calibrationStatus: st,
      lastCalibration: extRec?.lastCalibration ?? undefined,
      externalCalibration: extRec
        ? {
            status: extRec.calibrationStatus ?? "UNKNOWN",
            lastCalibration: extRec.lastCalibration ?? undefined,
            period: extRec.period,
          }
        : undefined,
    };
  };

  for (const [fid, list] of byId) {
    const eid = fileToExt.get(fid);
    const id = eid ?? fid;
    assets.push(makeAsset(id, fid, list, eid ? extLatest.get(eid) : undefined));
    for (const s of list) outSessions.push(eid && eid !== fid ? { ...s, assetId: eid } : s);

    if (hasExt && !eid && !conflictedFile.has(fid)) {
      // "Tidak Lolos" = any session of the most recent check month failed or is in repair.
      const lastPeriod = list.map((x) => x.period).sort().pop();
      const failed = list
        .filter((x) => x.period === lastPeriod)
        .some((x) => x.overall === "NOT_OK" || (x.detailStatus ?? "").toUpperCase() === "REPAIR");
      issues.push({
        id: issueId(),
        severity: failed ? "high" : "medium",
        type: "MISSING_IN_LATEST",
        assetId: fid,
        source: "torque",
        message: `${fid} ada di file torque tetapi tidak ada di data verifikasi terbaru${latestExtPeriod ? ` (${periodLabel(latestExtPeriod)})` : ""}${failed ? "; status cek terakhir Tidak Lolos" : ""}.`,
      });
    }
  }
  for (const eid of unmatchedExt) {
    assets.push(makeAsset(eid, undefined, [], extLatest.get(eid)));
  }
  return { assets, sessions: outSessions };
}

function mergeVerificationFiles(files: { name: string; records: VerificationRecord[] }[]): VerificationRecord[] {
  const byKey = new Map<string, VerificationRecord[]>();
  for (const f of files) {
    const mine = new Map<string, VerificationRecord[]>();
    for (const r of f.records) {
      const k = `${r.assetId}|${r.period}`;
      mine.set(k, [...(mine.get(k) ?? []), r]);
    }
    for (const [k, recs] of mine) byKey.set(k, recs); // newer file replaces
  }
  return [...byKey.values()].flat();
}

export function buildDomainModel(books: RawBooks, today: Date = new Date()): DomainModel {
  const issues: DataIssue[] = [];

  const sert = books.sertifikasi
    ? parseSertifikasi(books.sertifikasi)
    : { data: { rawData: [], dataSheet: [], certifications: [], calibrations: [] }, issues: [] };
  const verifFiles = books.verifikasiFiles ?? (books.verifikasi ? [{ name: "verifikasi-alat-ukur.xlsx", book: books.verifikasi }] : []);
  const parsedFiles = verifFiles.map((f) => ({
    name: f.name,
    ...parseVerifikasi(f.book, { fileName: f.name, detectGaps: false }),
  }));
  const torq = books.torque ? parseTorque(books.torque) : { data: [], issues: [] };

  issues.push(...sert.issues, ...torq.issues);
  for (const f of parsedFiles) issues.push(...f.issues);

  // Gaps across all verification files.
  const allPeriods = [...new Set(parsedFiles.flatMap((f) => f.periods))].sort();
  if (allPeriods.length >= 2) {
    const present = new Set(allPeriods);
    const [fy, fm] = allPeriods[0].split("-").map(Number);
    const [ly, lm] = allPeriods[allPeriods.length - 1].split("-").map(Number);
    let y = fy;
    let m = fm;
    while (y < ly || (y === ly && m <= lm)) {
      const p = `${y}-${String(m).padStart(2, "0")}`;
      if (!present.has(p)) {
        issues.push({
          id: issueId(),
          severity: "low",
          type: "MISSING_PERIOD",
          source: "verifikasi",
          message: `Tidak ada data verifikasi untuk periode ${p}; ditampilkan sebagai celah.`,
        });
      }
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  }

  const merged = mergeVerificationFiles(parsedFiles.map((f) => ({ name: f.name, records: f.data })));
  const measuringRecs = merged.filter((r) => r.group !== "TORQUE");
  const torqueRecs = merged.filter((r) => r.group === "TORQUE");
  const latestVerifPeriod = merged.map((r) => r.period).sort().pop();
  const measuringPeriods = new Set(measuringRecs.map((r) => r.period));

  const lifting = buildLiftingAssets(sert.data.rawData, sert.data.dataSheet, today, issues);
  const measuring = buildMeasuringAssets(
    sert.data.calibrations,
    measuringRecs,
    today,
    { latestPeriod: [...measuringPeriods].sort().pop(), periodCount: measuringPeriods.size },
    issues,
  );
  const torque = buildTorqueAssets(torq.data, torqueRecs, today, issues);

  const verificationFiles: VerificationFileInfo[] = parsedFiles.map((f) => ({ name: f.name, periods: f.periods }));
  const verificationMeta: VerificationReportMeta[] = parsedFiles.flatMap((f) => f.meta);

  return {
    assets: [...lifting, ...measuring, ...torque.assets],
    certifications: sert.data.certifications,
    calibrations: sert.data.calibrations,
    verifications: measuringRecs,
    torqueCalibrations: torqueRecs,
    torqueSessions: torque.sessions,
    issues,
    dataAsOf: format(today, "yyyy-MM-dd"),
    verificationFiles,
    verificationMeta,
    latestPeriods: {
      verifikasi: latestVerifPeriod,
      torque: torq.data.map((s) => s.period).sort().pop(),
    },
  };
}
