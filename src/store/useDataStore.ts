import { create } from "zustand";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type { DomainModel } from "@/domain/types";
import type {
  ParseFileInput,
  ParseRequest,
  ParseResponseOk,
  ParseResponseErr,
  ParsedFileInfo,
} from "@/workers/parse.worker";

/** Used only when manifest.json cannot be fetched. */
const FALLBACK_MANIFEST: Manifest = {
  sertifikasi: "sertifikasi-peralatan.xlsx",
  torque: "kalibrasi-torque-wrench.xlsx",
  verifikasi: ["verifikasi/verifikasi-2026-10.xlsx", "verifikasi/verifikasi-2026-11.xlsx"],
};

interface Manifest {
  sertifikasi?: string;
  torque?: string;
  verifikasi?: string[];
}

const IDB_KEY = "brc-uploaded-files";

interface StoredFiles {
  /** Uploaded files (added on top of the bundled defaults). */
  files: { name: string; buffer: ArrayBuffer }[];
  /** Bundled default files the user removed (by manifest path). */
  removedDefaults?: string[];
  uploadedAt: string;
}

export interface ActiveFile extends ParsedFileInfo {
  periods?: string[];
}

interface DataState {
  model: DomainModel | null;
  loading: boolean;
  error: string | null;
  summary: string | null;
  source: "default" | "uploaded";
  dataAsOf: string | null;
  files: ActiveFile[];
  init: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  removeFile: (file: ActiveFile) => Promise<void>;
  resetToDefault: () => Promise<void>;
}

function runWorker(files: ParseFileInput[]): Promise<ParseResponseOk> {
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

async function fetchManifest(): Promise<Manifest> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/manifest.json`);
    if (!res.ok) return FALLBACK_MANIFEST;
    return (await res.json()) as Manifest;
  } catch {
    return FALLBACK_MANIFEST;
  }
}

/** Bundled defaults, in manifest order, minus the ones the user removed. */
async function fetchDefaults(removed: string[] = []): Promise<ParseFileInput[]> {
  const m = await fetchManifest();
  const paths = [m.sertifikasi, m.torque, ...(m.verifikasi ?? [])].filter(
    (p): p is string => !!p && !removed.includes(p),
  );
  const out: ParseFileInput[] = [];
  for (const path of paths) {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
    if (!res.ok) throw new Error(`Gagal memuat ${path}`);
    // `name` is the manifest path so it can be matched against `removedDefaults`.
    out.push({ name: path, buffer: await res.arrayBuffer(), origin: "default" });
  }
  return out;
}

function toActive(result: ParseResponseOk): ActiveFile[] {
  return result.files.map((f) => ({
    ...f,
    periods: result.model.verificationFiles.find((v) => v.name === f.name)?.periods,
  }));
}

async function loadAll(stored: StoredFiles | undefined): Promise<ParseResponseOk> {
  const defaults = await fetchDefaults(stored?.removedDefaults);
  const uploaded: ParseFileInput[] = (stored?.files ?? []).map((f) => ({
    name: f.name,
    buffer: f.buffer.slice(0),
    origin: "uploaded",
  }));
  return runWorker([...defaults, ...uploaded]);
}

export const useDataStore = create<DataState>((set, get) => ({
  model: null,
  loading: false,
  error: null,
  summary: null,
  source: "default",
  dataAsOf: null,
  files: [],

  init: async () => {
    set({ loading: true, error: null });
    try {
      const stored = (await idbGet(IDB_KEY)) as StoredFiles | undefined;
      const result = await loadAll(stored);
      const customised = !!stored && (stored.files.length > 0 || (stored.removedDefaults?.length ?? 0) > 0);
      set({
        model: result.model,
        summary: result.summary,
        files: toActive(result),
        source: customised ? "uploaded" : "default",
        dataAsOf: customised ? stored!.uploadedAt : new Date().toISOString(),
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  // Uploaded files are ADDED to what is already active. A same-name file replaces its older copy;
  // sertifikasi / torque uploads replace the bundled one of the same kind.
  uploadFiles: async (fileList) => {
    set({ loading: true, error: null });
    try {
      const stored = (await idbGet(IDB_KEY)) as StoredFiles | undefined;
      const incoming = await Promise.all(
        fileList.map(async (f) => ({ name: f.name, buffer: await f.arrayBuffer() })),
      );
      const kept = (stored?.files ?? []).filter((f) => !incoming.some((n) => n.name === f.name));
      const next: StoredFiles = {
        files: [...kept, ...incoming],
        removedDefaults: stored?.removedDefaults,
        uploadedAt: new Date().toISOString(),
      };
      const result = await loadAll(next);
      const unknown = result.files.filter((f) => f.origin === "uploaded" && f.kind === "unknown");
      if (unknown.length > 0) {
        throw new Error(`File tidak dikenali: ${unknown.map((f) => f.name).join(", ")}`);
      }
      await idbSet(IDB_KEY, next);
      set({
        model: result.model,
        summary: result.summary,
        files: toActive(result),
        source: "uploaded",
        dataAsOf: next.uploadedAt,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  removeFile: async (file) => {
    set({ loading: true, error: null });
    try {
      const stored = ((await idbGet(IDB_KEY)) as StoredFiles | undefined) ?? {
        files: [],
        uploadedAt: new Date().toISOString(),
      };
      const next: StoredFiles =
        file.origin === "uploaded"
          ? { ...stored, files: stored.files.filter((f) => f.name !== file.name) }
          : { ...stored, removedDefaults: [...(stored.removedDefaults ?? []), file.name] };
      const result = await loadAll(next);
      await idbSet(IDB_KEY, next);
      set({
        model: result.model,
        summary: result.summary,
        files: toActive(result),
        source: "uploaded",
        dataAsOf: get().dataAsOf,
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
      const result = await loadAll(undefined);
      set({
        model: result.model,
        summary: result.summary,
        files: toActive(result),
        source: "default",
        dataAsOf: new Date().toISOString(),
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
