import { readFileSync } from "node:fs";
import path from "node:path";
import { workbookToBook } from "@/parsers/workbook";
import type { SheetBook } from "@/domain/build";

const DATA_DIR = path.resolve(__dirname, "../public/data");

export function loadBook(file: string): SheetBook {
  const buf = readFileSync(path.join(DATA_DIR, file));
  return workbookToBook(buf);
}

export function loadAllBooks() {
  return {
    sertifikasi: loadBook("sertifikasi-peralatan.xlsx"),
    verifikasi: loadBook("verifikasi-alat-ukur.xlsx"),
    torque: loadBook("kalibrasi-torque-wrench.xlsx"),
  };
}
