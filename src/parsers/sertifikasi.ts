import type {
  CertificationRecord,
  MeasuringCalibration,
  DataIssue,
  ParseResult,
} from "@/domain/types";
import {
  type Row,
  buildColumnMap,
  findHeaderRow,
  isBlankRow,
  issueId,
  looksLikeId,
  normalizeAssetId,
  parseFlexibleDate,
  parseNumber,
  plainText,
  textOrNull,
} from "./shared";
import { normalizeLocation } from "@/config/locations";

const FILE = "sertifikasi-peralatan.xlsx";

export interface RawDataRow {
  id: string;
  category?: string;
  swlTon?: number | null;
  location?: string | null;
  lastInspection?: Date;
  certificateNo?: string | null;
  expiryDate?: Date;
  vendor?: string | null;
  processStage?: string | null;
  actualCondition?: string | null;
  remark?: string | null;
  lastPrPo?: string | null;
}

export interface DataSheetRow {
  id: string;
  name?: string | null;
  category?: string | null;
  swlTon?: number | null;
  size?: string | null;
  expiryDateAlt?: Date;
  registryStatus?: string | null;
  lastInspection?: Date;
  rencanaPemeriksaan?: Date;
  lastPr?: string | null;
  lastPo?: string | null;
  location?: string | null;
  brand?: string | null;
  remark?: string | null;
}

export interface SertifikasiParsed {
  rawData: RawDataRow[];
  dataSheet: DataSheetRow[];
  certifications: CertificationRecord[];
  calibrations: MeasuringCalibration[]; // from ALAT UKUR
}

function get(row: Row, map: Record<string, number>, field: string): unknown {
  const idx = map[field];
  if (idx === undefined) return null;
  return row[idx] ?? null;
}

function parseRawData(rows: Row[], issues: DataIssue[]): RawDataRow[] {
  const headerIdx = findHeaderRow(rows, ["ITEM NO", "CATEGORY", "EXPIRED DATE"]);
  if (headerIdx < 0) return [];
  const map = buildColumnMap(rows[headerIdx], {
    id: (h) => h.includes("ITEM NO") || h.includes("ASSET NO"),
    category: (h) => h === "CATEGORY",
    swlTon: (h) => h.includes("SWL CAPACITY"),
    location: (h) => h === "LOCATION",
    lastInspection: (h) => h.includes("LAST INSP"),
    certificateNo: (h) => h.includes("CERTIFICATION NO"),
    expiryDate: (h) => h.includes("EXPIRED DATE"),
    vendor: (h) => h === "VENDOR",
    processStage: (h) => h.includes("INSPECTION REMARKS"),
    actualCondition: (h) => h.includes("ACTUAL CONDITION"),
    remark: (h) => h === "REMARK",
    lastPrPo: (h) => h.includes("LAST PR/PO") || h.includes("LAST PR / PO"),
  });

  const out: RawDataRow[] = [];
  let blanks = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (isBlankRow(row)) {
      if (++blanks >= 3) break;
      continue;
    }
    blanks = 0;
    const rawId = get(row, map, "id");
    const id = normalizeAssetId(rawId);
    if (!id) {
      if (textOrNull(rawId) !== null) {
        issues.push({
          id: issueId(),
          severity: "medium",
          type: "INVALID_ID",
          source: `${FILE} › RAW DATA › baris ${i + 1}`,
          message: `ID aset kosong atau "?" di RAW DATA baris ${i + 1}, baris dilewati.`,
        });
      }
      continue;
    }
    out.push({
      id,
      category: textOrNull(get(row, map, "category"))?.toUpperCase() ?? undefined,
      swlTon: parseNumber(get(row, map, "swlTon")),
      location: normalizeLocation(get(row, map, "location")),
      lastInspection: parseFlexibleDate(get(row, map, "lastInspection")) ?? undefined,
      certificateNo: textOrNull(get(row, map, "certificateNo")),
      expiryDate: parseFlexibleDate(get(row, map, "expiryDate")) ?? undefined,
      vendor: textOrNull(get(row, map, "vendor")),
      processStage: plainText(get(row, map, "processStage")),
      actualCondition: textOrNull(get(row, map, "actualCondition")),
      remark: textOrNull(get(row, map, "remark")),
      lastPrPo: textOrNull(get(row, map, "lastPrPo")),
    });
  }
  return out;
}

function parseDataSheet(rows: Row[], issues: DataIssue[]): DataSheetRow[] {
  const headerIdx = findHeaderRow(rows, ["KODE ASET", "DESCRIPTION", "STATUS"]);
  if (headerIdx < 0) return [];
  const map = buildColumnMap(rows[headerIdx], {
    id: (h) => h === "KODE ASET",
    name: (h) => h === "DESCRIPTION",
    category: (h) => h === "CATEGORY",
    swlTon: (h) => h.includes("SWL"),
    size: (h) => h.includes("SIZE") || h.includes("KAPASITAS"),
    expiryDateAlt: (h) => h.includes("MASA BERLAKU"),
    registryStatus: (h) => h === "STATUS",
    lastInspection: (h) => h.includes("LAST INSPECTION"),
    rencanaPemeriksaan: (h) => h.includes("RENCANA"),
    lastPr: (h) => h === "LAST PR",
    lastPo: (h) => h === "LAST PO",
    location: (h) => h === "LOKASI",
    brand: (h) => h === "BRAND",
    remark: (h) => h === "REMARK",
  });

  const out: DataSheetRow[] = [];
  let blanks = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (isBlankRow(row)) {
      if (++blanks >= 3) break;
      continue;
    }
    blanks = 0;
    let id = normalizeAssetId(get(row, map, "id"));
    const desc = get(row, map, "name");
    if (!id && looksLikeId(desc)) {
      id = normalizeAssetId(desc);
    }
    if (!id) continue;
    out.push({
      id,
      name: textOrNull(desc),
      category: textOrNull(get(row, map, "category"))?.toUpperCase() ?? undefined,
      swlTon: parseNumber(get(row, map, "swlTon")),
      size: textOrNull(get(row, map, "size")),
      expiryDateAlt: parseFlexibleDate(get(row, map, "expiryDateAlt")) ?? undefined,
      registryStatus: textOrNull(get(row, map, "registryStatus"))?.toUpperCase() ?? undefined,
      lastInspection: parseFlexibleDate(get(row, map, "lastInspection")) ?? undefined,
      rencanaPemeriksaan: parseFlexibleDate(get(row, map, "rencanaPemeriksaan")) ?? undefined,
      lastPr: textOrNull(get(row, map, "lastPr")),
      lastPo: textOrNull(get(row, map, "lastPo")),
      location: normalizeLocation(get(row, map, "location")),
      brand: textOrNull(get(row, map, "brand")),
      remark: textOrNull(get(row, map, "remark")),
    });
    void issues;
  }
  return out;
}

function parseAlatUkur(rows: Row[], issues: DataIssue[]): MeasuringCalibration[] {
  const headerIdx = findHeaderRow(rows, ["ID ASSET", "EXPIRE DATE"]);
  if (headerIdx < 0) return [];
  const map = buildColumnMap(rows[headerIdx], {
    id: (h) => h === "ID ASSET",
    name: (h) => h.includes("NAMA ALAT UKUR"),
    brand: (h) => h === "BRAND",
    expiryDate: (h) => h.includes("EXPIRE DATE"),
    qty: (h) => h === "QTY",
    po: (h) => h === "PO",
    vendor: (h) => h === "VENDOR",
    sentToVendorAt: (h) => h.includes("SUBMIT TO VENDOR"),
    returnedFromVendorAt: (h) => h.includes("SUPPLY FROM VENDOR"),
    poStatus: (h) => h === "STATUS",
    batch: (h) => h === "TAHAP",
    certificateNote: (h) => h === "SERTIFIKAT",
    remark: (h) => h === "KETERANGAN",
  });

  const out: MeasuringCalibration[] = [];
  let blanks = 0;
  // data starts a couple rows after header (blank row 2)
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (isBlankRow(row)) {
      if (++blanks >= 3) break;
      continue;
    }
    blanks = 0;
    const id = normalizeAssetId(get(row, map, "id"));
    if (!id) continue;
    const statusRaw = textOrNull(get(row, map, "poStatus"))?.toUpperCase();
    out.push({
      assetId: id,
      expiryDate: parseFlexibleDate(get(row, map, "expiryDate")) ?? undefined,
      vendor: textOrNull(get(row, map, "vendor")) ?? undefined,
      po: textOrNull(get(row, map, "po")) ?? undefined,
      poStatus: statusRaw === "OPEN" ? "OPEN" : statusRaw === "CLOSE" ? "CLOSE" : undefined,
      sentToVendorAt: parseFlexibleDate(get(row, map, "sentToVendorAt")) ?? undefined,
      returnedFromVendorAt: parseFlexibleDate(get(row, map, "returnedFromVendorAt")) ?? undefined,
      batch: parseNumber(get(row, map, "batch")) ?? undefined,
      remark: textOrNull(get(row, map, "remark")) ?? undefined,
    });
  }
  void issues;
  return out;
}

export function parseSertifikasi(
  sheets: Record<string, Row[]>,
): ParseResult<SertifikasiParsed> {
  const issues: DataIssue[] = [];
  const rawData = parseRawData(sheets["RAW DATA"] ?? [], issues);
  const dataSheet = parseDataSheet(sheets["DATA"] ?? [], issues);
  const calibrations = parseAlatUkur(sheets["ALAT UKUR"] ?? [], issues);

  const certifications: CertificationRecord[] = rawData.map((r) => ({
    assetId: r.id,
    certificateNo: r.certificateNo ?? undefined,
    lastInspection: r.lastInspection,
    expiryDate: r.expiryDate,
    vendor: r.vendor ?? undefined,
    processStage: r.processStage ?? undefined,
    prPo: r.lastPrPo ?? undefined,
  }));

  return { data: { rawData, dataSheet, certifications, calibrations }, issues };
}
