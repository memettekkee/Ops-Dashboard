import type { ControlType } from "@/domain/types";

export type Row = (unknown | null)[];

/** Normalize a header cell for comparison: trim, uppercase, collapse whitespace/newlines. */
export function normHeader(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, " ").trim().toUpperCase();
}

/** Find the index of the header row by requiring all given tokens to be present. */
export function findHeaderRow(
  rows: Row[],
  requiredTokens: string[],
  searchLimit = 15,
): number {
  const tokens = requiredTokens.map((t) => normHeader(t));
  const limit = Math.min(searchLimit, rows.length);
  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] ?? []).map(normHeader);
    const joined = cells.join("|");
    if (tokens.every((t) => cells.some((c) => c.includes(t)) || joined.includes(t))) {
      return i;
    }
  }
  return -1;
}

/** Build a column index map from a header row, matching by predicate on normalized header. */
export function buildColumnMap(
  headerRow: Row,
  mapping: Record<string, (h: string) => boolean>,
): Record<string, number> {
  const result: Record<string, number> = {};
  const norm = headerRow.map(normHeader);
  for (const [field, pred] of Object.entries(mapping)) {
    const idx = norm.findIndex((h) => h !== "" && pred(h));
    if (idx !== -1) result[field] = idx;
  }
  return result;
}

/** Treat empty/"-"/"0" text cells as null. */
export function textOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || s === "-" || s === "0") return null;
  return s;
}

export function plainText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * Normalize an asset id: uppercase, trim, remove spaces around hyphens.
 * Does NOT add/remove leading zeros. Returns null for "?"/empty.
 */
export function normalizeAssetId(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  let s = String(v).trim().toUpperCase();
  if (s === "" || s === "?") return null;
  s = s.replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

const ID_PATTERN = /^[A-Z]{2,5}-/;
export function looksLikeId(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  return ID_PATTERN.test(String(v).trim().toUpperCase());
}

/**
 * Determine the control type from an asset id.
 * - TW-BRC-... => TORQUE
 * - BRC-TW-01..03 => LIFTING (TABLE WORK, a trap)
 * - BRC-ST-xxx (3-digit) => MEASURING; BRC-ST-0x/1x (2-digit) => LIFTING (Stand Jack)
 */
export function controlTypeFromId(id: string): ControlType | null {
  const up = id.toUpperCase();
  if (/^TW-BRC/.test(up)) return "TORQUE";
  const stMatch = up.match(/^BRC-ST-(\d+)/);
  if (stMatch) {
    return stMatch[1].length >= 3 ? "MEASURING" : "LIFTING";
  }
  return null;
}

/** Parse a number that may be a JS number or a string with comma decimals / spaces. */
export function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (s === "" || s === "-") return null;
  s = s.replace(/\s+/g, "");
  // If both comma and dot exist, assume dot is decimal, comma thousands.
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const MONTHS: Record<string, number> = {
  januari: 0, jan: 0, january: 0,
  februari: 1, feb: 1, february: 1, pebruari: 1,
  maret: 2, mar: 2, march: 2,
  april: 3, apr: 3,
  mei: 4, may: 4,
  juni: 5, jun: 5, june: 5,
  juli: 6, jul: 6, july: 6,
  agustus: 7, aug: 7, agu: 7, august: 7, agt: 7,
  september: 8, sep: 8, sept: 8,
  oktober: 9, oct: 9, okt: 9, october: 9,
  november: 10, nov: 10, nop: 10,
  desember: 11, dec: 11, des: 11, december: 11,
};

/** Parse a month-year sheet name ("Januari 2026", "OCT 2026", "JUNE 2026"). */
export function parseMonthYearSheet(
  name: string,
): { period: string; year: number; month: number } | null {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const monthName = parts[0].toLowerCase();
  const year = parseInt(parts[parts.length - 1], 10);
  const month = MONTHS[monthName];
  if (month === undefined || !Number.isFinite(year)) return null;
  const period = `${year}-${String(month + 1).padStart(2, "0")}`;
  return { period, year, month };
}

/**
 * Parse a date that is either a real Date, an Excel serial, or a D/M/YYYY string
 * with dotted time ("5/8/2026 10.40", "01/09/2026 10.50 A.M").
 * Day/Month ordering is always D/M (never M/D).
 */
export function parseFlexibleDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    // Excel serial date (days since 1899-12-30)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  if (s === "" || s === "-" || s.toUpperCase() === "UNKNOWN") return null;
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    const year = parseInt(dmy[3], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Detect whether we should stop reading (signature/footer or 3 blank rows). */
export function countTrailingBlank(rows: Row[], from: number): number {
  let blanks = 0;
  for (let i = from; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (r.every((c) => c === null || c === undefined || String(c).trim() === "")) {
      blanks++;
    } else break;
  }
  return blanks;
}

export function isBlankRow(r: Row): boolean {
  return (r ?? []).every(
    (c) => c === null || c === undefined || String(c).trim() === "",
  );
}

let issueCounter = 0;
export function issueId(): string {
  issueCounter += 1;
  return `iss-${issueCounter}`;
}
