export type Area =
  | "Tool Room"
  | "Assembly"
  | "Disassembly"
  | "Test Bench"
  | "Storage/WIP"
  | "Interport"
  | "Lainnya";

export const UNFILLED_LOCATION_LABEL = "Lokasi belum diisi";

/** Explicit mapping for known noisy location strings (case-insensitive after trim). */
const LOCATION_MAP: Record<string, string> = {
  "strorage repair": "Storage Repair",
  "storage repair": "Storage Repair",
  "disassy bay 1": "Disassembly Bay 1",
  "disassembly bay 1": "Disassembly Bay 1",
  tr: "Tool Room",
  "tool room": "Tool Room",
  "test bent pt": "Test Bench PT",
  "test bench pt": "Test Bench PT",
  "assembly (bay 4)": "Assembly Bay 4",
  "dyno test": "Dyno Test",
};

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Returns a normalized location label, or null when the cell is empty/placeholder. */
export function normalizeLocation(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "" || s === "-" || s === "0") return null;
  const key = s.toLowerCase().replace(/\s+/g, " ");
  if (LOCATION_MAP[key]) return LOCATION_MAP[key];
  return titleCase(s.replace(/\s+/g, " "));
}

/** Groups a normalized location into a coarse area used for filters/charts. */
export function locationToArea(location: string | null): Area {
  if (!location) return "Lainnya";
  const l = location.toLowerCase();
  if (l.includes("tool room")) return "Tool Room";
  if (l.includes("disassembly") || l.includes("disassy")) return "Disassembly";
  if (l.includes("assembly") || l.includes("assy") || l.includes("fabrikasi"))
    return "Assembly";
  if (l.includes("test bench") || l.includes("test bent") || l.includes("dyno"))
    return "Test Bench";
  if (
    l.includes("storage") ||
    l.includes("wip") ||
    l.includes("repair") ||
    l.includes("rack")
  )
    return "Storage/WIP";
  if (l.includes("interport") || l.includes("port")) return "Interport";
  return "Lainnya";
}
