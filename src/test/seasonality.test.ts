import { describe, it, expect } from "vitest";
import { GRANDE_TRAITE_RATIO, grandeTraiteBounds, isGrandeTraite, samplingRateRange } from "@/lib/campaign";
import { distributeShipment } from "@/lib/shipment-utils";

const producers = (n: number, potential: number, seasonCap?: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    full_name: `Producteur ${i}`,
    section: `Section ${String.fromCharCode(65 + (i % 3))}`,
    plantation_code: `PL-${i}`,
    remaining_potential: potential,
    delivery_potential: potential,
    season_cap_remaining: seasonCap,
  }));

describe("règle de saisonnalité 70 %", () => {
  it("janvier = grande traite, mars = petite traite", () => {
    expect(isGrandeTraite("2027-01-15")).toBe(true);
    expect(isGrandeTraite("2027-02-28")).toBe(true);
    expect(isGrandeTraite("2026-09-01")).toBe(true);
    expect(isGrandeTraite("2027-03-01")).toBe(false);
    expect(isGrandeTraite("2027-08-31")).toBe(false);
  });

  it("bornes de la grande traite d'une campagne", () => {
    expect(grandeTraiteBounds("2026-2027")).toEqual({ startIso: "2026-09-01", endExclusiveIso: "2027-03-01" });
    expect(GRANDE_TRAITE_RATIO).toBe(0.7);
  });

  it("janvier : aucun producteur ne dépasse son solde de grande traite", () => {
    // Potentiel 3000, déjà 1950 livrés → solde grande traite = 2100 − 1950 = 150 kg.
    const r = distributeShipment(producers(40, 3000, 150), 4000, 80, new Date("2027-01-10"), new Date("2027-01-20"), 0);
    expect(r.length).toBeGreaterThan(0);
    for (const d of r) expect(d.allocated_weight).toBeLessThanOrEqual(150);
    expect(r.reduce((s, d) => s + d.allocated_weight, 0)).toBe(4000);
  });

  it("janvier : solde de grande traite épuisé → distribution bloquée", () => {
    expect(distributeShipment(producers(40, 3000, 0), 4000, 80, new Date("2027-01-10"), new Date("2027-01-20"), 0)).toEqual([]);
  });

  it("mars : le solde est débloqué (plafond = potentiel restant)", () => {
    const r = distributeShipment(producers(20, 3000, 900), 8000, 160, new Date("2027-03-10"), new Date("2027-03-20"), 0);
    expect(r.length).toBeGreaterThan(0);
    expect(r.reduce((s, d) => s + d.allocated_weight, 0)).toBe(8000);
  });
});

describe("taux de prélèvement saisonniers", () => {
  it("plages par période", () => {
    expect(samplingRateRange("2026-09-15")).toEqual({ min: 15, max: 20 });
    expect(samplingRateRange("2026-10-31")).toEqual({ min: 15, max: 20 });
    expect(samplingRateRange("2026-11-01")).toEqual({ min: 20, max: 30 });
    expect(samplingRateRange("2027-02-15")).toEqual({ min: 20, max: 30 });
    expect(samplingRateRange("2027-03-01")).toEqual({ min: 15, max: 20 });
    expect(samplingRateRange("2027-08-31")).toEqual({ min: 15, max: 20 });
  });

  it("septembre : jamais plus de 20 % du potentiel par producteur", () => {
    const r = distributeShipment(producers(40, 3000), 15000, 250, new Date("2026-09-10"), new Date("2026-09-20"), 0);
    expect(r.length).toBeGreaterThan(0);
    for (const d of r) expect(d.allocated_weight).toBeLessThanOrEqual(600);
  });
});
