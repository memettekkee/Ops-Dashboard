import { create } from "zustand";
import type { Asset, ComplianceStatus, ControlType } from "@/domain/types";

export interface Filters {
  type: ControlType | "ALL";
  areas: string[];
  categories: string[];
  vendors: string[];
  statuses: ComplianceStatus[];
  usable: "ALL" | "YES" | "NO";
  period: string | null; // "2026-10"
}

interface FilterState extends Filters {
  setType: (t: ControlType | "ALL") => void;
  toggleArea: (a: string) => void;
  toggleCategory: (c: string) => void;
  toggleVendor: (v: string) => void;
  toggleStatus: (s: ComplianceStatus) => void;
  setUsable: (u: "ALL" | "YES" | "NO") => void;
  setPeriod: (p: string | null) => void;
  reset: () => void;
  hydrate: (f: Partial<Filters>) => void;
}

const initial: Filters = {
  type: "ALL",
  areas: [],
  categories: [],
  vendors: [],
  statuses: [],
  usable: "ALL",
  period: null,
};

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export const useFilterStore = create<FilterState>((set) => ({
  ...initial,
  setType: (type) => set({ type }),
  toggleArea: (a) => set((s) => ({ areas: toggle(s.areas, a) })),
  toggleCategory: (c) => set((s) => ({ categories: toggle(s.categories, c) })),
  toggleVendor: (v) => set((s) => ({ vendors: toggle(s.vendors, v) })),
  toggleStatus: (st) => set((s) => ({ statuses: toggle(s.statuses, st) })),
  setUsable: (usable) => set({ usable }),
  setPeriod: (period) => set({ period }),
  reset: () => set({ ...initial }),
  hydrate: (f) => set((s) => ({ ...s, ...f })),
}));

export function applyFilters(assets: Asset[], f: Filters): Asset[] {
  return assets.filter((a) => {
    if (f.type !== "ALL" && a.controlType !== f.type) return false;
    if (f.areas.length && !(a.area && f.areas.includes(a.area))) return false;
    if (f.categories.length && !f.categories.includes(a.category)) return false;
    if (f.vendors.length && !(a.vendor && f.vendors.includes(a.vendor))) return false;
    if (f.statuses.length && !f.statuses.includes(a.compliance)) return false;
    if (f.usable === "YES" && !a.usable.ok) return false;
    if (f.usable === "NO" && a.usable.ok) return false;
    return true;
  });
}

export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.type !== "ALL") p.set("type", f.type);
  if (f.areas.length) p.set("area", f.areas.join(","));
  if (f.categories.length) p.set("cat", f.categories.join(","));
  if (f.vendors.length) p.set("vendor", f.vendors.join(","));
  if (f.statuses.length) p.set("status", f.statuses.join(","));
  if (f.usable !== "ALL") p.set("usable", f.usable);
  if (f.period) p.set("period", f.period);
  return p;
}

export function paramsToFilters(p: URLSearchParams): Partial<Filters> {
  const f: Partial<Filters> = {};
  const type = p.get("type");
  if (type) f.type = type as ControlType;
  const area = p.get("area");
  if (area) f.areas = area.split(",");
  const cat = p.get("cat");
  if (cat) f.categories = cat.split(",");
  const vendor = p.get("vendor");
  if (vendor) f.vendors = vendor.split(",");
  const status = p.get("status");
  if (status) f.statuses = status.split(",") as ComplianceStatus[];
  const usable = p.get("usable");
  if (usable === "YES" || usable === "NO") f.usable = usable;
  const period = p.get("period");
  if (period) f.period = period;
  return f;
}
