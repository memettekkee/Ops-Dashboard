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
    // Surface formula-error cells (#VALUE!, #REF!, ...) as text so parsers can flag them.
    const ref = ws["!ref"];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      for (const key of Object.keys(ws)) {
        if (key[0] === "!") continue;
        const cell = ws[key] as XLSX.CellObject;
        if (cell.t !== "e") continue;
        const addr = XLSX.utils.decode_cell(key);
        const r = addr.r - range.s.r;
        const c = addr.c - range.s.c;
        if (!rows[r]) rows[r] = [];
        rows[r][c] = cell.w ?? "#ERROR!";
      }
    }
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
