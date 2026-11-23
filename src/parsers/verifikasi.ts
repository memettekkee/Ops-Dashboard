import type { VerificationRecord, DataIssue, ParseResult, VerificationReportMeta } from "@/domain/types";
import { isV2Sheet, parseVerifikasiV2Sheet, checkSummaryMismatch } from "./verifikasi-v2";
import {
  type Row,
  buildColumnMap,
  findHeaderRow,
  isBlankRow,
  issueId,
  normalizeAssetId,
  parseFlexibleDate,
  parseMonthYearSheet,
  textOrNull,
} from "./shared";
import { mapVerificationResult } from "@/config/statusMaps";

const DEFAULT_FILE = "verifikasi-alat-ukur.xlsx";

function get(row: Row, map: Record<string, number>, field: string): unknown {
  const idx = map[field];
  if (idx === undefined) return null;
  return row[idx] ?? null;
}

export interface VerifikasiParseOptions {
  fileName?: string;
  /** Report MISSING_PERIOD gaps for this file alone (default true). The merged model does it across files. */
  detectGaps?: boolean;
}

export function parseVerifikasi(
  sheets: Record<string, Row[]>,
  opts: VerifikasiParseOptions = {},
): ParseResult<VerificationRecord[]> & { periods: string[]; meta: VerificationReportMeta[] } {
  const FILE = opts.fileName ?? DEFAULT_FILE;
  const meta2: VerificationReportMeta[] = [];
  const issues: DataIssue[] = [];
  const records: VerificationRecord[] = [];
  const presentPeriods = new Set<string>();

  for (const [sheetName, rows] of Object.entries(sheets)) {
    if (/kalibrasi/i.test(sheetName)) continue; // plan matrix, ignore
    if (/^summary$/i.test(sheetName.trim())) continue;
    if (isV2Sheet(rows)) {
      const r = parseVerifikasiV2Sheet(sheetName, rows, FILE);
      records.push(...r.records);
      issues.push(...r.issues);
      if (r.period) {
        presentPeriods.add(r.period);
        if (r.meta) meta2.push(r.meta);
      }
      issues.push(...checkSummaryMismatch(sheets["Summary"], r.records, FILE));
      continue;
    }
    const meta = parseMonthYearSheet(sheetName);
    if (!meta) continue;
    presentPeriods.add(meta.period);

    const headerIdx = findHeaderRow(rows, ["ID ON SITE"]);
    if (headerIdx < 0) continue;
    const map = buildColumnMap(rows[headerIdx], {
      assetId: (h) => h.includes("ID ON SITE"),
      name: (h) => h.includes("NAMA ALAT UKUR"),
      brand: (h) => h === "BRAND",
      checkedAt: (h) => h.includes("DATE INPECTION") || h.includes("DATE INSPECTION"),
      result: (h) => h.startsWith("RESULT"),
      remark: (h) => h.includes("REMAK") || h.includes("REMARKS"),
      lastCalibration: (h) => h.includes("LAST CALIBRATION"),
      handover: (h) => h.includes("TANGGAL BST KE LOG"),
    });

    let sheetHasResult = false;
    let blanks = 0;
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      if (isBlankRow(row)) {
        if (++blanks >= 3) break;
        continue;
      }
      blanks = 0;
      const id = normalizeAssetId(get(row, map, "assetId"));
      if (!id || /^(INSPECT(ED)?|CHECKED)\s*BY/.test(id)) break; // footer / signatures => stop
      const { result, unmapped } = mapVerificationResult(get(row, map, "result"));
      if (result !== "NO_DATA") sheetHasResult = true;
      if (unmapped) {
        issues.push({
          id: issueId(),
          severity: "low",
          type: "UNMAPPED_VALUE",
          assetId: id,
          source: `${FILE} › ${sheetName} › baris ${i + 1}`,
          message: `Nilai hasil "${String(get(row, map, "result"))}" untuk ${id} tidak dikenali.`,
        });
      }
      const lastCalRaw = get(row, map, "lastCalibration");
      let lastCalibration: Date | null | undefined;
      if (lastCalRaw !== null && lastCalRaw !== undefined) {
        const s = String(lastCalRaw).trim().toUpperCase();
        lastCalibration = s === "UNKNOWN" || s === "" || s === "-" ? null : parseFlexibleDate(lastCalRaw);
        if (s === "UNKNOWN") {
          issues.push({
            id: issueId(),
            severity: "low",
            type: "UNKNOWN_LAST_CALIBRATION",
            assetId: id,
            source: `${FILE} › ${sheetName} › baris ${i + 1}`,
            message: `Tanggal kalibrasi terakhir ${id} tidak diketahui (UNKNOWN).`,
          });
        }
      }
      records.push({
        assetId: id,
        period: meta.period,
        checkedAt: parseFlexibleDate(get(row, map, "checkedAt")) ?? undefined,
        result,
        remark: textOrNull(get(row, map, "remark")) ?? undefined,
        lastCalibration,
        format: "v1",
        sourceFile: FILE,
      });
    }

    if (!sheetHasResult) {
      issues.push({
        id: issueId(),
        severity: "medium",
        type: "EMPTY_RESULTS",
        source: `${FILE} › ${sheetName}`,
        message: `Sheet ${sheetName} tidak punya hasil verifikasi; ditampilkan sebagai "Belum Dicek".`,
      });
    }
  }

  // Detect missing months (gaps) within the observed range.
  const periods = [...presentPeriods].sort();
  if (opts.detectGaps !== false && periods.length >= 2) {
    const first = periods[0];
    const last = periods[periods.length - 1];
    const [fy, fm] = first.split("-").map(Number);
    const [ly, lm] = last.split("-").map(Number);
    let y = fy;
    let m = fm;
    while (y < ly || (y === ly && m <= lm)) {
      const p = `${y}-${String(m).padStart(2, "0")}`;
      if (!presentPeriods.has(p)) {
        issues.push({
          id: issueId(),
          severity: "low",
          type: "MISSING_PERIOD",
          source: `${FILE}`,
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

  return { data: records, issues, periods, meta: meta2 };
}
