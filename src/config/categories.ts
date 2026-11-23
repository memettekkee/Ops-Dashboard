/** Measuring-tool categories derived from the tool name (case-insensitive, first match wins). */
const RULES: { test: RegExp; category: string }[] = [
  { test: /PRESSURE GAUGE/i, category: "Pressure Gauge" },
  { test: /DIAL INDICATOR|DIAL GAUGE/i, category: "Dial Indicator" },
  { test: /TETRA/i, category: "Tetra Gauge" },
  { test: /MICRO\s?METER/i, category: "Micrometer" },
  { test: /BORE GAUGE/i, category: "Bore Gauge" },
  { test: /CALIPER/i, category: "Caliper" },
  { test: /DEPTH/i, category: "Depth Gauge" },
  { test: /ROUGHNESS/i, category: "Roughness Tester" },
  { test: /TORQUE WRENCH/i, category: "Torque Wrench" },
];

export const OTHER_CATEGORY = "Lainnya";

export function measuringCategory(name: string | undefined | null): string {
  const n = name ?? "";
  return RULES.find((r) => r.test.test(n))?.category ?? OTHER_CATEGORY;
}

export const MEASURING_CATEGORIES = [...RULES.map((r) => r.category).filter((c) => c !== "Torque Wrench"), OTHER_CATEGORY];

/** "Pressure Gauge Noshok,SN. 25-9, 100 Psi" => { cleanName: "Pressure Gauge Noshok, 100 Psi", serialNumber: "25-9" } */
export function splitSerial(name: string): { cleanName: string; serialNumber?: string } {
  const m = name.match(/,?\s*SN\.?\s*([^,]+)/i);
  if (!m) return { cleanName: name.trim() };
  const serialNumber = m[1].trim() || undefined;
  const cleanName = name.replace(m[0], "").replace(/\s*,\s*/g, ", ").replace(/^,\s*|,\s*$/g, "").replace(/\s+/g, " ").trim();
  return { cleanName: cleanName || name.trim(), serialNumber };
}
