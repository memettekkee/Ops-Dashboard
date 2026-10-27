import { create } from "zustand";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type { DomainModel } from "@/domain/types";
import type {
  ParseRequest,
  ParseResponseOk,
  ParseResponseErr,
} from "@/workers/parse.worker";

const DEFAULT_FILES = [
  "sertifikasi-peralatan.xlsx",
  "verifikasi-alat-ukur.xlsx",
  "kalibrasi-torque-wrench.xlsx",
];

const IDB_KEY = "brc-uploaded-files";

interface StoredFiles {
  files: { name: string; buffer: ArrayBuffer }[];
  uploadedAt: string;
}

interface DataState {
  model: DomainModel | null;
  loading: boolean;
  error: string | null;
  summary: string | null;
  source: "default" | "uploaded";
  dataAsOf: string | null;
  init: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  resetToDefault: () => Promise<void>;
}

function runWorker(files: { name: string; buffer: ArrayBuffer }[]): Promise<ParseResponseOk> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/parse.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent<ParseResponseOk | ParseResponseErr>) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    const req: ParseRequest = { files };
    worker.postMessage(req, files.map((f) => f.buffer));
  });
}

async function fetchDefaults(): Promise<{ name: string; buffer: ArrayBuffer }[]> {
  const out: { name: string; buffer: ArrayBuffer }[] = [];
  for (const name of DEFAULT_FILES) {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`);
    if (!res.ok) throw new Error(`Gagal memuat ${name}`);
    out.push({ name, buffer: await res.arrayBuffer() });
  }
  return out;
}

export const useDataStore = create<DataState>((set) => ({
  model: null,
  loading: false,
  error: null,
  summary: null,
  source: "default",
  dataAsOf: null,

  init: async () => {
    set({ loading: true, error: null });
    try {
      const stored = (await idbGet(IDB_KEY)) as StoredFiles | undefined;
      let files: { name: string; buffer: ArrayBuffer }[];
      let source: "default" | "uploaded";
      let asOf: string;
      if (stored && stored.files.length > 0) {
        files = stored.files.map((f) => ({ name: f.name, buffer: f.buffer.slice(0) }));
        source = "uploaded";
        asOf = stored.uploadedAt;
      } else {
        files = await fetchDefaults();
        source = "default";
        asOf = new Date().toISOString();
      }
      const result = await runWorker(files);
      set({
        model: result.model,
        summary: result.summary,
        source,
        dataAsOf: asOf,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  uploadFiles: async (fileList) => {
    set({ loading: true, error: null });
    try {
      const files = await Promise.all(
        fileList.map(async (f) => ({ name: f.name, buffer: await f.arrayBuffer() })),
      );
      const result = await runWorker(files.map((f) => ({ name: f.name, buffer: f.buffer.slice(0) })));
      const uploadedAt = new Date().toISOString();
      const toStore: StoredFiles = { files, uploadedAt };
      await idbSet(IDB_KEY, toStore);
      set({
        model: result.model,
        summary: result.summary,
        source: "uploaded",
        dataAsOf: uploadedAt,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  resetToDefault: async () => {
    set({ loading: true, error: null });
    try {
      await idbDel(IDB_KEY);
      const files = await fetchDefaults();
      const result = await runWorker(files);
      set({
        model: result.model,
        summary: result.summary,
        source: "default",
        dataAsOf: new Date().toISOString(),
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
