/// <reference lib="webworker" />
import { workbookToBook, detectFileKind } from "@/parsers/workbook";
import { buildDomainModel, type RawBooks } from "@/domain/build";
import type { DomainModel } from "@/domain/types";

export interface ParseRequest {
  files: { name: string; buffer: ArrayBuffer }[];
}

export interface ParseResponseOk {
  ok: true;
  model: DomainModel;
  summary: string;
}
export interface ParseResponseErr {
  ok: false;
  error: string;
}

self.onmessage = (e: MessageEvent<ParseRequest>) => {
  try {
    const books: RawBooks = {};
    for (const f of e.data.files) {
      const book = workbookToBook(f.buffer);
      const kind = detectFileKind(book);
      if (kind === "sertifikasi") books.sertifikasi = book;
      else if (kind === "verifikasi") books.verifikasi = book;
      else if (kind === "torque") books.torque = book;
    }
    const model = buildDomainModel(books);
    const measuring = model.assets.filter((a) => a.controlType === "MEASURING").length;
    const torque = model.assets.filter((a) => a.controlType === "TORQUE").length;
    const lifting = model.assets.filter((a) => a.controlType === "LIFTING").length;
    const summary = `${lifting} alat angkat, ${measuring} alat ukur, ${torque} torque wrench terbaca, ${model.issues.length} peringatan data`;
    const res: ParseResponseOk = { ok: true, model, summary };
    (self as unknown as Worker).postMessage(res);
  } catch (err) {
    const res: ParseResponseErr = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(res);
  }
};
