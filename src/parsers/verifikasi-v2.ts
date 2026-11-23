import type {
  CalibrationStatus,
  DataIssue,
  VerificationRecord,
  VerificationResult,
  VerificationReportMeta,
} from "@/domain/types";
import { differenceInCalendarDays } from "date-fns";
import {
  type Row,
  buildColumnMap,
  findHeaderRow,
  issueId,
  normalizeAssetId,
  normHeader,
  parseFlexibleDate,
  textOrNull,
} from "./shared";
import { mapCalibrationStatus } from "@/config/statusMaps";

const ERROR_CELL = /^#(VALUE|REF|N\/A|DIV\/0|NAME|NUM|NULL|GETTING_DATA)[!?]?$/i;

function get(row: Row, map: Record<string, number>, field: string): unknown {
  const idx = map[field];
  if (idx === undefined) return null;
  return row[idx] ?? null;
}

/** True when the sheet's header row is the v2 layout (RESULT (GOOD / DAMAGE) + STATUS). */
export function isV2Header(headerRow: Row | undefined): boolean {
  if (!headerRow) return false;
  const hs = headerRow.map((c) => normHeader(c));
  return (
    hs.some((h) => h.includes("ID ON SITE")) &&
    hs.some((h) => h.startsWith("RESULT") && h.includes("GOOD")) &&
    hs.some((h) => h === "STATUS")
  );
}

export function isV2Sheet(rows: Row[]): boolean {
  const idx = findHeaderRow(rows, ["ID ON SITE"]);
  return idx >= 0 && isV2Header(rows[idx]);
}

/** Number or text ID => string without exponent notation or trailing ".0". */
export function idCellToString(v: unknown): string | null {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    return Number.isInteger(v) ? v.toFixed(0) : String(v);
  }
  return normalizeAssetId(v);
}

export function normalizeBrand(v: unknown): string | undefined {
  const s = textOrNull(v);
  if (!s) return undefined;
  const t = String(s).trim();
  if (/^(CATERPILAR|CATERPILLAR|CAT)$/i.test(t)) return "Caterpillar";
  return t
    .toLowerCase()
    .replace(/(^|[\s(/-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

function periodOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function deriveResult(
  physical: "GOOD" | "DAMAGE" | undefined,
  status: CalibrationStatus,
): VerificationResult {
  if (physical === "DAMAGE" || status === "DAMAGE") return "NOT_OK";
  if (physical !== "GOOD") return "UNKNOWN";
  switch (status) {
    case "CALIBRATED":
      return "OK";
    case "NEED_CALIBRATION":
      return "DUE_CALIBRATION";
    case "ON_PROGRESS":
      return "AT_VENDOR";
    default:
      return "UNKNOWN";
  }
}

export interface V2SheetResult {
  records: VerificationRecord[];
  issues: DataIssue[];
  period?: string;
  meta?: VerificationReportMeta;
}

export function parseVerifikasiV2Sheet(
  sheetName: string,
  rows: Row[],
  fileName: string,
): V2SheetResult {
  const issues: DataIssue[] = [];
  const records: VerificationRecord[] = [];
  const loc = (extra: string) => `${fileName} › ${sheetName}${extra}`;

  // Formula errors anywhere in the sheet (e.g. B1 = #VALUE!).
  rows.forEach((r, ri) => {
    (r ?? []).forEach((c, ci) => {
      if (typeof c === "string" && ERROR_CELL.test(c.trim())) {
        const addr = `${String.fromCharCode(65 + (ci % 26))}${ri + 1}`;
        issues.push({
          id: issueId(),
          severity: "low",
          type: "FORMULA_ERROR",
          source: loc(` › ${addr}`),
          message: `Sel ${addr} di sheet ${sheetName} berisi error rumus ${c.trim()}; diabaikan.`,
        });
      }
    });
  });

  const headerIdx = findHeaderRow(rows, ["ID ON SITE"]);
  const map = buildColumnMap(rows[headerIdx], {
    no: (h) => h === "NO." || h === "NO",
    group: (h) => h.includes("DESCRIPTION"),
    name: (h) => h.includes("NAMA ALAT"),
    brand: (h) => h === "BRAND",
    assetId: (h) => h.includes("ID ON SITE"),
    checkedAt: (h) => h.includes("DATE INPECTION") || h.includes("DATE INSPECTION"),
    physical: (h) => h.startsWith("RESULT"),
    lastCalibration: (h) => h.includes("LAST CALIBRATION"),
    status: (h) => h === "STATUS",
    remarks: (h) => h.startsWith("REMARK"),
  });
  const noCol = map.no ?? 0;

  // Data rows: until column A is no longer a number.
  let end = headerIdx + 1;
  for (; end < rows.length; end++) {
    if (typeof (rows[end] ?? [])[noCol] !== "number") break;
  }

  // Report period: any Date cell above the header (J1), else most frequent inspection month.
  let period: string | undefined;
  for (let i = 0; i < headerIdx && !period; i++) {
    for (const c of rows[i] ?? []) {
      if (c instanceof Date && !isNaN(c.getTime())) {
        period = periodOf(c);
        break;
      }
    }
  }
  if (!period) {
    const freq = new Map<string, number>();
    for (let i = headerIdx + 1; i < end; i++) {
      const d = parseFlexibleDate(get(rows[i], map, "checkedAt"));
      if (d) freq.set(periodOf(d), (freq.get(periodOf(d)) ?? 0) + 1);
    }
    period = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  if (!period) {
    issues.push({
      id: issueId(),
      severity: "high",
      type: "EMPTY_RESULTS",
      source: loc(""),
      message: `Periode laporan sheet ${sheetName} tidak dapat ditentukan (J1 kosong dan tidak ada tanggal inspeksi); sheet dilewati.`,
    });
    return { records, issues };
  }

  for (let i = headerIdx + 1; i < end; i++) {
    const row = rows[i] ?? [];
    const id = idCellToString(get(row, map, "assetId"));
    if (!id) continue;
    const src = loc(` › baris ${i + 1}`);

    const groupRaw = String(get(row, map, "group") ?? "").toUpperCase();
    const group = groupRaw.includes("TORQUE") ? "TORQUE" : "MEASUREMENT";

    const physRaw = String(get(row, map, "physical") ?? "").trim().toUpperCase();
    const physicalResult: "GOOD" | "DAMAGE" | undefined = physRaw === "GOOD" ? "GOOD" : physRaw === "DAMAGE" ? "DAMAGE" : undefined;
    if (!physicalResult) {
      issues.push({
        id: issueId(),
        severity: "low",
        type: "UNMAPPED_VALUE",
        assetId: id,
        source: src,
        message: `Nilai hasil "${physRaw}" untuk ${id} tidak dikenali.`,
      });
    }

    const st = mapCalibrationStatus(get(row, map, "status"));
    if (st.unmapped) {
      issues.push({
        id: issueId(),
        severity: "low",
        type: "UNMAPPED_VALUE",
        assetId: id,
        source: src,
        message: `Status "${String(get(row, map, "status") ?? "")}" untuk ${id} tidak dikenali.`,
      });
    }

    const checkedAt = parseFlexibleDate(get(row, map, "checkedAt")) ?? undefined;
    const lcRaw = get(row, map, "lastCalibration");
    const lastCalibration = lcRaw === null || lcRaw === undefined ? null : parseFlexibleDate(lcRaw);

    const remarksRaw = textOrNull(get(row, map, "remarks"));
    const remarks = remarksRaw === null ? undefined : String(remarksRaw).trim();
    const poNumber = remarks && /^\d{10}$/.test(remarks) ? remarks : undefined;
    const note = remarks && !poNumber ? remarks : undefined;

    if (!/^(BRC-|TW-)/i.test(id)) {
      issues.push({
        id: issueId(),
        severity: "low",
        type: "NON_STANDARD_ID",
        assetId: id,
        source: src,
        message: `ID ${id} tidak berawalan BRC- atau TW-.`,
      });
    }

    if (lastCalibration && checkedAt && differenceInCalendarDays(lastCalibration, checkedAt) >= 0) {
      const after = differenceInCalendarDays(lastCalibration, checkedAt) > 0;
      if (st.status === "NEED_CALIBRATION") {
        issues.push({
          id: issueId(),
          severity: "medium",
          type: "STATUS_DATE_CONFLICT",
          assetId: id,
          source: src,
          message: `${id} berstatus Need Calibration tetapi Last Calibration (${lastCalibration.toLocaleDateString("id-ID")}) tidak lebih awal dari tanggal cek (${checkedAt.toLocaleDateString("id-ID")}). Status mengikuti kolom Status.`,
        });
      } else if (after) {
        issues.push({
          id: issueId(),
          severity: "low",
          type: "LAST_CAL_AFTER_CHECK",
          assetId: id,
          source: src,
          message: `Last Calibration ${id} (${lastCalibration.toLocaleDateString("id-ID")}) lebih baru dari tanggal cek (${checkedAt.toLocaleDateString("id-ID")}).`,
        });
      }
    }

    records.push({
      assetId: id,
      period,
      checkedAt,
      result: deriveResult(physicalResult, st.status),
      remark: remarks,
      lastCalibration,
      format: "v2",
      group,
      physicalResult,
      calibrationStatus: st.status,
      poNumber,
      note,
      sourceFile: fileName,
      name: textOrNull(get(row, map, "name")) ?? undefined,
      brand: normalizeBrand(get(row, map, "brand")),
    });
  }

  // Footer: "Inspect by" / "Checked by" and the names below them.
  let inspectedBy: string[] = [];
  let checkedBy: string | undefined;
  for (let i = end; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const ic = row.findIndex((c) => /inspect by/i.test(String(c ?? "")));
    if (ic < 0) continue;
    const cc = row.findIndex((c) => /checked by/i.test(String(c ?? "")));
    for (let j = i + 1; j < rows.length; j++) {
      const names = rows[j] ?? [];
      if (names.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;
      const stop = cc > ic ? cc : names.length;
      inspectedBy = names
        .slice(ic, stop)
        .map((c) => String(c ?? "").trim())
        .filter(Boolean);
      if (cc >= 0) checkedBy = String(names[cc] ?? "").trim() || undefined;
      break;
    }
    break;
  }

  return { records, issues, period, meta: { period, sourceFile: fileName, inspectedBy, checkedBy } };
}

/** Recompute per-status counts (Measurement only) and compare with the pivot in the `Summary` sheet. */
export function checkSummaryMismatch(
  summaryRows: Row[] | undefined,
  records: VerificationRecord[],
  fileName: string,
): DataIssue[] {
  if (!summaryRows) return [];
  const hdr = summaryRows.findIndex((r) => (r ?? []).some((c) => String(c ?? "").trim().toUpperCase() === "STATUS"));
  if (hdr < 0) return [];
  const stated: Record<string, number> = {};
  for (let i = hdr + 1; i < summaryRows.length; i++) {
    const r = summaryRows[i] ?? [];
    const label = String(r[0] ?? "").trim();
    if (!label || /grand total/i.test(label)) continue;
    if (typeof r[1] === "number") stated[mapCalibrationStatus(label).status] = r[1];
  }
  const actual: Record<string, number> = {};
  for (const rec of records) {
    if (rec.group === "TORQUE") continue;
    const k = rec.calibrationStatus ?? "UNKNOWN";
    actual[k] = (actual[k] ?? 0) + 1;
  }
  const keys = new Set([...Object.keys(stated), ...Object.keys(actual)]);
  const diffs = [...keys].filter((k) => (stated[k] ?? 0) !== (actual[k] ?? 0));
  if (diffs.length === 0) return [];
  const fmt = (o: Record<string, number>) => diffs.map((k) => `${k} ${o[k] ?? 0}`).join(" / ");
  return [
    {
      id: issueId(),
      severity: "low",
      type: "SUMMARY_MISMATCH",
      source: `${fileName} › Summary`,
      message: `Sheet Summary tidak cocok dengan sheet Data. Summary: ${fmt(stated)}. Hitungan data: ${fmt(actual)}.`,
    },
  ];
}
