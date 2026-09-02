import { describe, it, expect } from "vitest";
import {
  distributeShipment,
  splitBagsExactly,
  verifyDistributionTotals,
  computeAverageBagWeight,
  bagWeightRange,
  isBagWeightInRange,
} from "@/lib/shipment-utils";

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

describe("sac moyen dynamique", () => {
  it("TEST 1 : 10 000 kg / 200 sacs → 50 kg, plage 45–55", () => {
    expect(computeAverageBagWeight(10000, 200)).toBe(50);
    expect(bagWeightRange(50)).toEqual({ min: 45, max: 55 });
  });

  it("TEST 2 : 45 223 kg / 652 sacs → 70 kg, plage 65–75", () => {
    expect(computeAverageBagWeight(45223, 652)).toBe(70);
    expect(bagWeightRange(70)).toEqual({ min: 65, max: 75 });
  });

  it("TEST 3/4/7/8 : 65 et 75 kg/sac autorisés", () => {
    expect(isBagWeightInRange(130, 2, 70)).toBe(true); // 65
    expect(isBagWeightInRange(150, 2, 70)).toBe(true); // 75
    expect(isBagWeightInRange(207, 3, 70)).toBe(true); // 69
    expect(isBagWeightInRange(292, 4, 70)).toBe(true); // 73
  });

  it("TEST 5/6 : 64 et 76 kg/sac refusés", () => {
    expect(isBagWeightInRange(128, 2, 70)).toBe(false); // 64
    expect(isBagWeightInRange(152, 2, 70)).toBe(false); // 76
  });
});

describe("distributeShipment — exactitude stricte et plage ±5 kg", () => {
  const cases: [number, number, number, number][] = [
    // poids, sacs, nb producteurs, potentiel
    [10000, 200, 20, 3000],
    [45223, 652, 60, 5000],
    [5000, 100, 15, 2000],
    [7333, 143, 11, 4000],
  ];

  for (const [w, b, n, pot] of cases) {
    it(`${w} kg / ${b} sacs → écart 0 et plage respectée`, () => {
      const r = distributeShipment(producers(n, pot), w, b, start, end, 0);
      expect(r.length).toBeGreaterThan(0);
      expect(totals(r)).toEqual({ weight: w, bags: b });
      const avg = computeAverageBagWeight(w, b);
      for (const d of r) {
        expect(Number.isInteger(d.allocated_weight)).toBe(true);
        expect(Number.isInteger(d.num_bags)).toBe(true);
        expect(isBagWeightInRange(d.allocated_weight, d.num_bags, avg)).toBe(true);
      }
    });
  }

  it("refuse les totaux non entiers", () => {
    expect(distributeShipment(producers(10), 10000.5, 200, start, end, 0)).toEqual([]);
    expect(distributeShipment(producers(10), 10000, 200.5, start, end, 0)).toEqual([]);
  });

  it("ne dépasse jamais le potentiel restant", () => {
    const list = producers(20, 1000).map((p, i) => (i === 0 ? { ...p, remaining_potential: 300 } : p));
    const r = distributeShipment(list, 4000, 80, start, end, 0);
    const first = r.find((d) => d.producer_id === "p0");
    if (first) expect(first.allocated_weight).toBeLessThanOrEqual(300);
    expect(totals(r).weight).toBe(4000);
  });

  it("retourne [] si une distribution exacte est impossible", () => {
    expect(distributeShipment(producers(2, 200), 10000, 200, start, end, 0)).toEqual([]);
    expect(distributeShipment(producers(50, 1000), 10000, 5, start, end, 0)).toEqual([]);
  });
});

describe("splitBagsExactly", () => {
  it("répartit exactement les sacs dans la plage ±5 kg", () => {
    const bags = splitBagsExactly([1000, 2500, 3500, 3000], 200, 50);
    expect(bags).not.toBeNull();
    expect(bags!.reduce((s, b) => s + b, 0)).toBe(200);
    expect(bags!.every((b) => Number.isInteger(b) && b > 0)).toBe(true);
  });

  it("refuse si moins de sacs que de producteurs", () => {
    expect(splitBagsExactly([100, 200, 300], 2, 50)).toBeNull();
  });

  it("refuse un poids incompatible avec la plage", () => {
    expect(splitBagsExactly([10, 20], 2, 70)).toBeNull();
  });
});

describe("verifyDistributionTotals", () => {
  it("TEST 10/12 : refuse les écarts", () => {
    expect(verifyDistributionTotals([{ allocated_weight: 9999, num_bags: 200 }], 10000, 200).ok).toBe(false);
    expect(verifyDistributionTotals([{ allocated_weight: 10000, num_bags: 199 }], 10000, 200).ok).toBe(false);
  });

  it("refuse les décimales", () => {
    expect(verifyDistributionTotals([{ allocated_weight: 10000.5, num_bags: 200 }], 10000.5, 200).ok).toBe(false);
  });

  it("TEST 9/11 : accepte l'égalité stricte", () => {
    expect(verifyDistributionTotals([{ allocated_weight: 10000, num_bags: 200 }], 10000, 200).ok).toBe(true);
  });
});
