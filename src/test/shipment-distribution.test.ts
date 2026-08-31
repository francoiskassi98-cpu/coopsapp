import { describe, it, expect } from "vitest";
import { distributeShipment, splitBagsExactly, verifyDistributionTotals } from "@/lib/shipment-utils";

const producers = (n: number, potential = 3000) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    full_name: `Producteur ${i}`,
    section: `Section ${String.fromCharCode(65 + (i % 5))}`,
    plantation_code: `PL-${i}`,
    remaining_potential: potential,
    delivery_potential: potential,
  }));

const start = new Date("2026-01-01");
const end = new Date("2026-01-20");

const totals = (r: { allocated_weight: number; num_bags: number }[]) => ({
  weight: r.reduce((s, d) => s + d.allocated_weight, 0),
  bags: r.reduce((s, d) => s + d.num_bags, 0),
});

describe("distributeShipment — exactitude stricte", () => {
  it("TEST 1 : 10 000 kg / 200 sacs → écart 0", () => {
    const r = distributeShipment(producers(20), 10000, 200, start, end, 0);
    expect(r.length).toBeGreaterThan(0);
    expect(totals(r)).toEqual({ weight: 10000, bags: 200 });
  });

  it("TEST 2 : 5 000 kg / 100 sacs → écart 0", () => {
    const r = distributeShipment(producers(15), 5000, 100, start, end, 0);
    expect(totals(r)).toEqual({ weight: 5000, bags: 100 });
  });

  it("TEST 3 & 4 : aucune valeur décimale", () => {
    const r = distributeShipment(producers(13, 2350), 8137, 137, start, end, 0);
    expect(r.length).toBeGreaterThan(0);
    for (const d of r) {
      expect(Number.isInteger(d.allocated_weight)).toBe(true);
      expect(Number.isInteger(d.num_bags)).toBe(true);
      expect(d.num_bags).toBeGreaterThan(0);
    }
    expect(totals(r)).toEqual({ weight: 8137, bags: 137 });
  });

  it("refuse les totaux non entiers", () => {
    expect(distributeShipment(producers(10), 10000.5, 200, start, end, 0)).toEqual([]);
    expect(distributeShipment(producers(10), 10000, 200.5, start, end, 0)).toEqual([]);
  });

  it("ne dépasse jamais le potentiel restant", () => {
    const list = producers(10, 1000).map((p, i) => (i === 0 ? { ...p, remaining_potential: 120 } : p));
    const r = distributeShipment(list, 4000, 80, start, end, 0);
    const first = r.find((d) => d.producer_id === "p0");
    if (first) expect(first.allocated_weight).toBeLessThanOrEqual(120);
    expect(totals(r).weight).toBe(4000);
  });

  it("retourne [] si une distribution exacte est impossible", () => {
    // Potentiel total insuffisant pour couvrir le poids déclaré
    expect(distributeShipment(producers(2, 200), 10000, 200, start, end, 0)).toEqual([]);
    // Plus de producteurs que de sacs disponibles
    expect(distributeShipment(producers(50, 1000), 10000, 5, start, end, 0)).toEqual([]);
  });

  it("est exact sur de nombreuses combinaisons", () => {
    for (const [w, b, n] of [
      [10000, 200, 20],
      [7333, 143, 11],
      [15001, 251, 30],
      [999, 21, 3],
    ] as [number, number, number][]) {
      const r = distributeShipment(producers(n, Math.ceil((w / n) * 3)), w, b, start, end, 0);
      expect(r.length).toBeGreaterThan(0);
      expect(totals(r)).toEqual({ weight: w, bags: b });
    }
  });
});

describe("splitBagsExactly", () => {
  it("répartit exactement les sacs", () => {
    const bags = splitBagsExactly([1000, 2500, 3333, 3167], 200, 60);
    expect(bags).not.toBeNull();
    expect(bags!.reduce((s, b) => s + b, 0)).toBe(200);
    expect(bags!.every((b) => Number.isInteger(b) && b > 0)).toBe(true);
  });

  it("refuse si moins de sacs que de producteurs", () => {
    expect(splitBagsExactly([100, 200, 300], 2, 60)).toBeNull();
  });
});

describe("verifyDistributionTotals", () => {
  it("TEST 5/6 : refuse les écarts", () => {
    expect(verifyDistributionTotals([{ allocated_weight: 9999, num_bags: 200 }], 10000, 200).ok).toBe(false);
    expect(verifyDistributionTotals([{ allocated_weight: 10000, num_bags: 199 }], 10000, 200).ok).toBe(false);
  });

  it("refuse les décimales", () => {
    expect(verifyDistributionTotals([{ allocated_weight: 10000.5, num_bags: 200 }], 10000.5, 200).ok).toBe(false);
  });

  it("TEST 7 : accepte l'égalité stricte", () => {
    expect(verifyDistributionTotals([{ allocated_weight: 10000, num_bags: 200 }], 10000, 200).ok).toBe(true);
  });
});
