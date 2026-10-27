import type { TorqueSession, DataIssue, ParseResult } from "@/domain/types";
import {
  type Row,
  findHeaderRow,
  issueId,
  normalizeAssetId,
  parseFlexibleDate,
  parseMonthYearSheet,
  parseNumber,
  textOrNull,
} from "./shared";
import { normalizeLocation } from "@/config/locations";

const FILE = "kalibrasi-torque-wrench.xlsx";

interface ParsedLabel {
  baseId: string;
  nominalNm?: number;
  location?: string;
}

const LOCATION_HINTS = ["BAY", "TR", "TEST BENT", "TEST BENCH", "DYNO"];

/** Parse column B label: base id, nominal Nm, and location from parentheses. */
export function parseTorqueLabel(label: string): ParsedLabel {
  const raw = label.trim();
  const base = normalizeAssetId(raw.replace(/\(.*?\)/g, "").trim()) ?? raw;

  // Nominal from suffix -68NM / -135NM / -300NM
  let nominalNm: number | undefined;
  const suffix = base.match(/-(\d+)NM$/i);
  if (suffix) nominalNm = parseInt(suffix[1], 10);

  // Collect parenthesized groups
  const parens = [...raw.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim());
  let location: string | undefined;
  for (const p of parens) {
    const nm = p.match(/(\d+)\s*NM/i);
    if (nm) {
      if (nominalNm === undefined) nominalNm = parseInt(nm[1], 10);
      continue;
    }
    const up = p.toUpperCase();
    if (LOCATION_HINTS.some((h) => up.startsWith(h) || up.includes(h))) {
      if (up === "TR") location = "Tool Room";
      else if (up.includes("TEST BENT") || up.includes("TEST BENCH")) location = "Test Bench PT";
      else if (up.includes("DYNO")) location = "Dyno Test";
      else location = normalizeLocation(p) ?? p.replace(/\s+/g, " ").trim();
    }
  }
  return { baseId: base, nominalNm, location };
}

export function parseTorque(
  sheets: Record<string, Row[]>,
): ParseResult<TorqueSession[]> {
  const issues: DataIssue[] = [];
  const sessions: TorqueSession[] = [];
  const dupTracker = new Map<string, number>(); // period|baseId -> count

  for (const [sheetName, rows] of Object.entries(sheets)) {
    const meta = parseMonthYearSheet(sheetName);
    if (!meta) continue;
    const headerIdx = findHeaderRow(rows, ["TORQUE RESULT"]);
    if (headerIdx < 0) continue;

    // Column indices are fixed by position per the file layout:
    // B=1 id, C=2 unitLabel, D=3 date, E=4 min, F=5 max, G=6 result, H=7 overall, I=8 torqueStatus, J=9 detail
    const C_ID = 1,
      C_UNIT = 2,
      C_DATE = 3,
      C_MIN = 4,
      C_MAX = 5,
      C_RESULT = 6,
      C_OVERALL = 7,
      C_DETAIL = 9;

    let inspectedBy: string | undefined;
    let current: {
      baseId: string;
      nominalNm?: number;
      location?: string;
      unitLabel?: string;
      checkedAt?: Date;
      min?: number;
      max?: number;
      readings: (number | null)[];
      overallFlags: string[];
      detailStatus?: string;
      sawInvalidRange: boolean;
    } | null = null;
    let sessionIndex = 0;

    const flush = () => {
      if (!current) return;
      const { min, max } = current;
      const rangeInvalid =
        current.sawInvalidRange ||
        (min !== undefined && max !== undefined && min >= max);
      if (rangeInvalid) {
        issues.push({
          id: issueId(),
          severity: "medium",
          type: "INVALID_RANGE",
          assetId: current.baseId,
          source: `${FILE} › ${sheetName}`,
          message: `Rentang torsi ${current.baseId} tidak valid (min ${min} ≥ max ${max}); dikeluarkan dari perhitungan lolos/gagal.`,
        });
      }
      let overall: "OK" | "NOT_OK" | "NO_DATA" = "NO_DATA";
      const flags = current.overallFlags.filter((f) => f !== "");
      const hasReading = current.readings.some((r) => r !== null);
      if (!hasReading && flags.length === 0) overall = "NO_DATA";
      else if (flags.some((f) => f.includes("NOT"))) overall = "NOT_OK";
      else if (flags.some((f) => f === "OK")) overall = "OK";
      else overall = hasReading ? "OK" : "NO_DATA";

      const key = `${meta.period}|${current.baseId}`;
      dupTracker.set(key, (dupTracker.get(key) ?? 0) + 1);

      sessions.push({
        assetId: current.baseId,
        period: meta.period,
        sessionIndex: sessionIndex++,
        location: current.location,
        unitLabel: current.unitLabel,
        checkedAt: current.checkedAt,
        nominalNm: current.nominalNm,
        min,
        max,
        readings: current.readings,
        overall,
        detailStatus: current.detailStatus,
        rangeInvalid,
        inspectedBy,
      });
      current = null;
    };

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const unitCell = textOrNull(row[C_UNIT]);
      if (unitCell && /inspect by/i.test(unitCell)) {
        flush();
        // Look ahead for names in subsequent rows.
        for (let j = i + 1; j < rows.length; j++) {
          const nameRow = rows[j] ?? [];
          const name = textOrNull(nameRow[C_UNIT]);
          if (name) {
            inspectedBy = name;
            break;
          }
        }
        break;
      }

      const labelCell = textOrNull(row[C_ID]);
      if (!labelCell) {
        // blank id row => session boundary
        continue;
      }
      const parsed = parseTorqueLabel(labelCell);
      const hasLocationParen = /\(/.test(labelCell) &&
        LOCATION_HINTS.some((h) => labelCell.toUpperCase().includes(h));
      const unitLabel = textOrNull(row[C_UNIT]) ?? undefined;
      const isNewUnitMarker =
        unitLabel !== undefined && /NO\.\s*\d/.test(unitLabel);

      const startNew =
        current === null ||
        current.baseId !== parsed.baseId ||
        hasLocationParen ||
        isNewUnitMarker;

      const rowMin = parseNumber(row[C_MIN]) ?? undefined;
      const rowMax = parseNumber(row[C_MAX]) ?? undefined;
      const rowRangeBad = rowMin !== undefined && rowMax !== undefined && rowMin >= rowMax;

      if (startNew) {
        flush();
        current = {
          baseId: parsed.baseId,
          nominalNm: parsed.nominalNm,
          location: parsed.location,
          unitLabel,
          checkedAt: parseFlexibleDate(row[C_DATE]) ?? undefined,
          min: rowRangeBad ? undefined : rowMin,
          max: rowRangeBad ? undefined : rowMax,
          readings: [],
          overallFlags: [],
          detailStatus: textOrNull(row[C_DETAIL]) ?? undefined,
          sawInvalidRange: rowRangeBad,
        };
      }
      if (current) {
        if (rowRangeBad) current.sawInvalidRange = true;
        if (!current.checkedAt) current.checkedAt = parseFlexibleDate(row[C_DATE]) ?? undefined;
        // Prefer a valid (min<max) pair for the session range.
        if (current.min === undefined && !rowRangeBad) current.min = rowMin;
        if (current.max === undefined && !rowRangeBad) current.max = rowMax;
        if (!current.location && parsed.location) current.location = parsed.location;
        if (current.nominalNm === undefined) current.nominalNm = parsed.nominalNm;
        current.readings.push(parseNumber(row[C_RESULT]));
        const overallRaw = (textOrNull(row[C_OVERALL]) ?? "").toUpperCase();
        current.overallFlags.push(overallRaw);
        const detail = textOrNull(row[C_DETAIL]);
        if (detail && !current.detailStatus) current.detailStatus = detail;
      }
    }
    flush();
  }

  // Emit duplicate-id-usage issues (one physical id used by >1 unit in same month).
  for (const [key, count] of dupTracker) {
    if (count > 1) {
      const [period, baseId] = key.split("|");
      issues.push({
        id: issueId(),
        severity: "low",
        type: "DUPLICATE_ID_USAGE",
        assetId: baseId,
        source: `${FILE}`,
        message: `ID ${baseId} dipakai ${count} unit fisik berbeda pada periode ${period}.`,
      });
    }
  }

  return { data: sessions, issues };
}
