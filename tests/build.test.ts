import { describe, it, expect } from "vitest";
import { loadAllBooks } from "./helpers";
import { buildDomainModel } from "@/domain/build";

describe("buildDomainModel", () => {
  const model = buildDomainModel(loadAllBooks(), new Date("2026-10-27"));

  it("produces assets of all three control types", () => {
    const types = new Set(model.assets.map((a) => a.controlType));
    expect(types.has("LIFTING")).toBe(true);
    expect(types.has("MEASURING")).toBe(true);
    expect(types.has("TORQUE")).toBe(true);
  });

  it("has 30 torque assets", () => {
    expect(model.assets.filter((a) => a.controlType === "TORQUE").length).toBe(30);
  });

  it("every asset has a usable verdict and compliance", () => {
    for (const a of model.assets) {
      expect(a.compliance).toBeDefined();
      expect(a.usable).toBeDefined();
    }
  });

  it("collects data issues", () => {
    expect(model.issues.length).toBeGreaterThan(0);
  });
});
