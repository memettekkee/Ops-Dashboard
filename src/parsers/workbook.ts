import * as XLSX from "xlsx";
import type { Row } from "./shared";
import type { SheetBook } from "@/domain/build";

/** Convert an XLSX workbook (ArrayBuffer/Uint8Array) into a sheet->rows book. */
export function workbookToBook(data: ArrayBuffer | Uint8Array): SheetBook {
  const wb = XLSX.read(data, { cellDates: true });
  const book: SheetBook = {};
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<Row>(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    book[name] = rows;
  }
  return book;
}

export function detectFileKind(book: SheetBook): "sertifikasi" | "verifikasi" | "torque" | "unknown" {
  const sheetNames = Object.keys(book);
  const hasRawAndAlat =
    sheetNames.some((n) => n.toUpperCase() === "RAW DATA") &&
    sheetNames.some((n) => n.toUpperCase() === "ALAT UKUR");
  if (hasRawAndAlat) return "sertifikasi";

  for (const rows of Object.values(book)) {
    for (const r of rows.slice(0, 6)) {
      const joined = (r ?? []).map((c) => String(c ?? "").toUpperCase()).join("|");
      if (joined.includes("TORQUE RESULT")) return "torque";
      if (joined.includes("ID ON SITE")) return "verifikasi";
    }
  }
  return "unknown";
}
