import { describe, it, expect } from "vitest";
import {
  normalizeAssetId,
  controlTypeFromId,
  parseNumber,
  parseFlexibleDate,
  parseMonthYearSheet,
} from "@/parsers/shared";

describe("normalizeAssetId", () => {
  it("removes spaces around hyphens and uppercases", () => {
    expect(normalizeAssetId("BRC - TW - 02")).toBe("BRC-TW-02");
    expect(normalizeAssetId(" brc-st-077 ")).toBe("BRC-ST-077");
  });
  it("does not change leading zeros / digit count", () => {
    expect(normalizeAssetId("BRC-ST-05")).toBe("BRC-ST-05");
    expect(normalizeAssetId("BRC-ST-077")).toBe("BRC-ST-077");
  });
  it("returns null for '?' and empty", () => {
    expect(normalizeAssetId("?")).toBeNull();
    expect(normalizeAssetId("")).toBeNull();
  });
});

describe("controlTypeFromId", () => {
  it("TW-BRC is torque", () => {
    expect(controlTypeFromId("TW-BRC-200-68NM")).toBe("TORQUE");
  });
  it("BRC-TW-01 is NOT torque (it is a table work / lifting)", () => {
    expect(controlTypeFromId("BRC-TW-01")).not.toBe("TORQUE");
  });
  it("BRC-ST with 3 digits is measuring, 2 digits is lifting", () => {
    expect(controlTypeFromId("BRC-ST-077")).toBe("MEASURING");
    expect(controlTypeFromId("BRC-ST-05")).toBe("LIFTING");
  });
});

describe("parseNumber", () => {
  it("handles comma decimals and trailing spaces", () => {
    expect(parseNumber("67,72    ")).toBeCloseTo(67.72);
    expect(parseNumber("65,43")).toBeCloseTo(65.43);
    expect(parseNumber("70.20")).toBeCloseTo(70.2);
  });
  it("returns null for dash/empty", () => {
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(null)).toBeNull();
  });
});

describe("parseFlexibleDate", () => {
  it("parses D/M/YYYY with dotted time (never M/D)", () => {
    const d = parseFlexibleDate("5/8/2026 10.40");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(7); // August
    expect(d?.getDate()).toBe(5);
  });
  it("parses 01/09/2026 as 1 September", () => {
    const d = parseFlexibleDate("01/09/2026 10.50 A.M");
    expect(d?.getMonth()).toBe(8);
    expect(d?.getDate()).toBe(1);
  });
});

describe("parseMonthYearSheet", () => {
  it("accepts Indonesian, English and 3-letter abbreviations", () => {
    expect(parseMonthYearSheet("Januari 2026")?.period).toBe("2026-01");
    expect(parseMonthYearSheet("OCT 2026")?.period).toBe("2026-10");
    expect(parseMonthYearSheet("JUNE 2026")?.period).toBe("2026-06");
    expect(parseMonthYearSheet("OKTOBER 2026")?.period).toBe("2026-10");
  });
});
