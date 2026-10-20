import { describe, it, expect } from "vitest";
import { computeEditCap, redistributeShipment } from "@/lib/shipment-edit";

describe("modification de chargement : plafonds", () => {
  it("applique 70 % en grande traite", () => {
    expect(computeEditCap(1000, "2026-11-10", [{ weight: 500, date: "2026-10-01" }])).toBe(200);
  });
  it("potentiel restant seul en petite traite", () => {
    expect(computeEditCap(1000, "2027-04-10", [{ weight: 500, date: "2026-10-01" }])).toBe(500);
  });
  it("un producteur plafonné est sauté, le surplus va aux autres", () => {
    const r = redistributeShipment(
      [{ id: "a", weight: 300, bags: 5, cap: 310 }, { id: "b", weight: 300, bags: 5, cap: 2000 }, { id: "c", weight: 300, bags: 5, cap: 2000 }],
      1200, 15,
    );
    expect(r.find((x) => x.id === "a")!.weight).toBeLessThanOrEqual(310);
    expect(r.reduce((s, x) => s + x.weight, 0)).toBe(1200);
  });
});
