import { describe, it, expect } from "vitest";
import { loadAllBooks } from "./helpers";
import { parseSertifikasi } from "@/parsers/sertifikasi";
import { parseVerifikasi } from "@/parsers/verifikasi";
import { parseTorque, parseTorqueLabel } from "@/parsers/torque";
import { detectFileKind } from "@/parsers/workbook";

const books = loadAllBooks();

describe("sertifikasi parser", () => {
  const { data } = parseSertifikasi(books.sertifikasi);
  it("reads a plausible count of RAW DATA ids (~273)", () => {
    const ids = new Set(data.rawData.map((r) => r.id));
    expect(ids.size).toBeGreaterThan(240);
    expect(ids.size).toBeLessThan(300);
  });
  it("reads a plausible count of DATA ids (~242)", () => {
    const ids = new Set(data.dataSheet.map((r) => r.id));
    expect(ids.size).toBeGreaterThan(210);
    expect(ids.size).toBeLessThan(270);
  });
  it("reads ALAT UKUR calibrations (~52 ids)", () => {
    const ids = new Set(data.calibrations.map((c) => c.assetId));
    expect(ids.size).toBeGreaterThan(40);
    expect(ids.size).toBeLessThan(70);
  });
});

describe("verifikasi parser", () => {
  const { data } = parseVerifikasi(books.verifikasi);
  it("October has ~86 assets", () => {
    const oct = data.filter((v) => v.period === "2026-10");
    const ids = new Set(oct.map((v) => v.assetId));
    expect(ids.size).toBeGreaterThan(70);
    expect(ids.size).toBeLessThan(100);
  });
  it("covers multiple months", () => {
    const periods = new Set(data.map((v) => v.period));
    expect(periods.size).toBeGreaterThanOrEqual(4);
  });
});

describe("torque parser", () => {
  const { data, issues } = parseTorque(books.torque);
  it("parses label base id and location", () => {
    expect(parseTorqueLabel("TW-BRC-201-68NM (BAY 1)").baseId).toBe("TW-BRC-201-68NM");
    expect(parseTorqueLabel("TW-BRC-201-68NM (BAY 1)").location).toBe("Bay 1");
    const st = parseTorqueLabel("TW-BRC-ST-228 (400NM) (TR)");
    expect(st.baseId).toBe("TW-BRC-ST-228");
    expect(st.nominalNm).toBe(400);
    expect(st.location).toBe("Tool Room");
  });
  it("has 30 unique base ids across 5 months", () => {
    const ids = new Set(data.map((s) => s.assetId));
    expect(ids.size).toBe(30);
    const periods = new Set(data.map((s) => s.period));
    expect(periods.size).toBe(5);
  });
  it("flags TW-BRC-205 invalid range in at least one month", () => {
    const invalid = data.filter((s) => s.assetId === "TW-BRC-205-68NM" && s.rangeInvalid);
    expect(invalid.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.type === "INVALID_RANGE")).toBe(true);
  });
  it("TW-BRC-ST-228 is NOT OK / repair from July onward", () => {
    const july = data.find((s) => s.assetId === "TW-BRC-ST-228" && s.period === "2026-07");
    expect(july).toBeDefined();
    const notOkOrRepair =
      july!.overall === "NOT_OK" ||
      (july!.detailStatus ?? "").toUpperCase() === "REPAIR";
    expect(notOkOrRepair).toBe(true);
  });
});

describe("file kind detection", () => {
  it("detects each file by sheet contents", () => {
    expect(detectFileKind(books.sertifikasi)).toBe("sertifikasi");
    expect(detectFileKind(books.verifikasi)).toBe("verifikasi");
    expect(detectFileKind(books.torque)).toBe("torque");
  });
});
