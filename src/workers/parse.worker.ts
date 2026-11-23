/// <reference lib="webworker" />
import { workbookToBook, detectFileKind } from "@/parsers/workbook";
import { buildDomainModel, type RawBooks, type SheetBook } from "@/domain/build";
import type { DomainModel } from "@/domain/types";

export interface ParseFileInput {
  name: string;
  buffer: ArrayBuffer;
  origin?: "default" | "uploaded";
}

export interface ParseRequest {
  files: ParseFileInput[];
}

export interface ParsedFileInfo {
  name: string;
  kind: "sertifikasi" | "verifikasi" | "torque" | "unknown";
  origin: "default" | "uploaded";
}

export interface ParseResponseOk {
  ok: true;
  model: DomainModel;
  summary: string;
  files: ParsedFileInfo[];
}
export interface ParseResponseErr {
  ok: false;
  error: string;
}

self.onmessage = (e: MessageEvent<ParseRequest>) => {
  try {
    const books: RawBooks = {};
    const infos: ParsedFileInfo[] = [];
    const verif: { name: string; book: SheetBook }[] = [];
    for (const f of e.data.files) {
      const book = workbookToBook(f.buffer);
      const kind = detectFileKind(book);
      infos.push({ name: f.name, kind, origin: f.origin ?? "default" });
      if (kind === "sertifikasi") books.sertifikasi = book;
      else if (kind === "torque") books.torque = book;
      else if (kind === "verifikasi") {
        // Files with the same name replace the earlier one; otherwise they are appended (newer last).
        const i = verif.findIndex((v) => v.name === f.name);
        if (i >= 0) verif.splice(i, 1);
        verif.push({ name: f.name, book });
      }
    }
    if (verif.length) books.verifikasiFiles = verif;
    const model = buildDomainModel(books);
    const measuring = model.assets.filter((a) => a.controlType === "MEASURING").length;
    const torque = model.assets.filter((a) => a.controlType === "TORQUE").length;
    const lifting = model.assets.filter((a) => a.controlType === "LIFTING").length;
    const summary = `${lifting} alat angkat, ${measuring} alat ukur, ${torque} torque wrench terbaca, ${model.issues.length} peringatan data`;
    const res: ParseResponseOk = { ok: true, model, summary, files: infos };
    (self as unknown as Worker).postMessage(res);
  } catch (err) {
    const res: ParseResponseErr = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(res);
  }
};
