import { describe, expect, it } from "vitest";
import { loadAllBooksRev1, loadBook } from "./helpers";
import { parseVerifikasi } from "@/parsers/verifikasi";
import { buildDomainModel } from "@/domain/build";
import { measuringCategory, splitSerial } from "@/config/categories";
import { torqueKey } from "@/domain/rules";

const novBook = loadBook("verifikasi/verifikasi-2026-11.xlsx");
const nov = parseVerifikasi(novBook, { fileName: "verifikasi-2026-11.xlsx" });
const books = loadAllBooksRev1();
const model = buildDomainModel(books, new Date("2026-11-23"));

describe("rev1: sheet Data (format v2)", () => {
  it("reads 181 records, 147 measurement + 34 torque, period 2026-11", () => {
    const v2 = nov.data.filter((r) => r.format === "v2");
    expect(v2).toHaveLength(181);
    expect(v2.filter((r) => r.group === "MEASUREMENT")).toHaveLength(147);
    expect(v2.filter((r) => r.group === "TORQUE")).toHaveLength(34);
    expect(new Set(v2.map((r) => r.period))).toEqual(new Set(["2026-11"]));
  });

  it("counts measuring statuses", () => {
    const m = nov.data.filter((r) => r.format === "v2" && r.group === "MEASUREMENT");
    const c = (s: string) => m.filter((r) => r.calibrationStatus === s).length;
    expect(c("CALIBRATED")).toBe(36);
    expect(c("NEED_CALIBRATION")).toBe(80);
    expect(c("ON_PROGRESS")).toBe(27);
    expect(c("DAMAGE")).toBe(4);
  });

  it("reads the numeric id as a string and flags it", () => {
    const r = nov.data.find((x) => x.assetId === "104050000878");
    expect(r).toBeDefined();
    expect(nov.issues.some((i) => i.type === "NON_STANDARD_ID" && i.assetId === "104050000878")).toBe(true);
  });

  it("does not read footer names as assets", () => {
    expect(nov.data.some((r) => /EKO|SURYA|FAISAL/i.test(r.assetId))).toBe(false);
    expect(nov.meta[0].inspectedBy).toEqual(["Surya Dwinata", "Eko Prasetyo"]);
    expect(nov.meta[0].checkedBy).toBe("Faisal K");
  });

  it("splits Remarks into poNumber / note", () => {
    expect(nov.data.some((r) => r.poNumber === "4010396340")).toBe(true);
    expect(nov.data.some((r) => r.note === "Gauge")).toBe(true);
  });

  it("flags data-quality issues", () => {
    expect(nov.issues.filter((i) => i.type === "STATUS_DATE_CONFLICT")).toHaveLength(24);
    expect(nov.issues.filter((i) => i.type === "SUMMARY_MISMATCH")).toHaveLength(1);
    expect(nov.issues.some((i) => i.type === "FORMULA_ERROR")).toBe(true);
  });

  it("derives the legacy result", () => {
    const m = nov.data.filter((r) => r.format === "v2");
    expect(m.filter((r) => r.result === "OK")).toHaveLength(36 + 34);
    expect(m.filter((r) => r.result === "NOT_OK")).toHaveLength(4);
  });
});

describe("rev1: merged verification files", () => {
  it("has one record per asset per month in Jan-Apr", () => {
    for (const p of ["2026-01", "2026-02", "2026-03", "2026-04"]) {
      const ids = model.verifications.filter((v) => v.period === p).map((v) => v.assetId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("keeps Oct (old file) and Nov (new file)", () => {
    const periods = new Set(model.verifications.map((v) => v.period));
    expect(periods.has("2026-10")).toBe(true);
    expect(periods.has("2026-11")).toBe(true);
  });

  it("finds 62 new BRC-ST-438..542 measuring tools + 1 numeric id", () => {
    const novel = model.assets.filter((a) => a.controlType === "MEASURING" && a.isNewThisPeriod);
    const st = novel.filter((a) => {
      const n = /^BRC-ST-(\d+)$/.exec(a.id)?.[1];
      return n && +n >= 438 && +n <= 542;
    });
    expect(st).toHaveLength(62);
    expect(novel.filter((a) => /^\d+$/.test(a.id))).toHaveLength(1);
    expect(novel).toHaveLength(63);
  });

  it("lets the latest status override date-based compliance", () => {
    const need = model.assets.filter((a) => a.calibrationStatus === "NEED_CALIBRATION");
    expect(need.length).toBe(80);
    expect(need.every((a) => a.compliance === "EXPIRED" && a.complianceReason === "STATUS" && !a.usable.ok)).toBe(true);
    const vendor = model.assets.filter((a) => a.calibrationStatus === "ON_PROGRESS");
    expect(vendor.every((a) => a.condition === "REPAIR")).toBe(true);
    const dmg = model.assets.filter((a) => a.calibrationStatus === "DAMAGE");
    expect(dmg.every((a) => a.condition === "BREAKDOWN")).toBe(true);
  });
});

describe("rev1: categories", () => {
  it("derives categories and serial numbers", () => {
    expect(measuringCategory("Digital Pressure Gauge X")).toBe("Pressure Gauge");
    expect(measuringCategory("MICRO METER,125 - 150 MM")).toBe("Micrometer");
    expect(measuringCategory("ROUGHNESS")).toBe("Roughness Tester");
    expect(measuringCategory("BLOW BY CHECKER")).toBe("Lainnya");
    expect(splitSerial("Pressure Gauge Enerpac,SN. G2516L, 3000 Psi")).toEqual({
      cleanName: "Pressure Gauge Enerpac, 3000 Psi",
      serialNumber: "G2516L",
    });
  });
});

describe("rev1: torque reconciliation", () => {
  const torque = model.assets.filter((a) => a.controlType === "TORQUE");
  const byNumber = (n: string) => torque.filter((a) => new RegExp(`^TW-BRC-(ST-)?${n}(-|$)`).test(a.id));

  it("builds the key from number and Nm", () => {
    expect(torqueKey("TW-BRC-ST-213-135NM")).toBe("213|135");
    expect(torqueKey("TW-BRC-ST-340 (1250NM)")).toBe("340|1250");
    expect(torqueKey("TW-BRC-ST-340", 1250)).toBe("340|1250");
  });

  it("merges 213 into one asset with the old id as alias", () => {
    const a = byNumber("213");
    expect(a).toHaveLength(1);
    expect(a[0].id).toBe("TW-BRC-ST-213-135NM");
    expect(a[0].aliases).toContain("TW-BRC-213-135NM");
  });

  it("keeps matching ids merged (200..211, 340)", () => {
    expect(byNumber("205")).toHaveLength(1);
    expect(byNumber("340")).toHaveLength(1);
  });

  it.each(["212", "224", "225", "226", "227"])("splits conflicting number %s into 2 assets + ID_CONFLICT", (n) => {
    expect(byNumber(n)).toHaveLength(2);
    expect(model.issues.some((i) => i.type === "ID_CONFLICT" && i.message.includes(`Nomor TW ${n}:`) && i.severity === "high")).toBe(true);
  });

  it("flags TW-BRC-ST-228 missing in latest as high", () => {
    const i = model.issues.find((x) => x.type === "MISSING_IN_LATEST" && x.assetId === "TW-BRC-ST-228");
    expect(i?.severity).toBe("high");
  });

  it("new torque wrenches have no monthly check but external calibration", () => {
    for (const n of ["229", "230", "231", "232", "483"]) {
      const a = byNumber(n);
      expect(a).toHaveLength(1);
      expect(a[0].hasMonthlyCheck).toBe(false);
      expect(a[0].externalCalibration?.status).toBe("CALIBRATED");
    }
  });
});
