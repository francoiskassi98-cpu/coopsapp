import { describe, it, expect } from "vitest";
import { redistributeShipment } from "@/lib/shipment-edit";

const rows = [
  { id: "a", weight: 900, bags: 14, cap: 2000 },
  { id: "b", weight: 600, bags: 10, cap: 2000 },
  { id: "c", weight: 500, bags: 8, cap: 2000 },
];
const sum = (r: { weight: number; bags: number }[], k: "weight" | "bags") => r.reduce((s, x) => s + x[k], 0);

describe("redistributeShipment", () => {
  it("poids seul : mêmes producteurs, total exact", () => {
    const r = redistributeShipment(rows, 2100, 32);
    expect(sum(r, "weight")).toBe(2100);
    expect(sum(r, "bags")).toBe(32);
    expect(r.every((x) => x.bags > 0)).toBe(true);
  });
  it("hausse des sacs : jamais plus de 15 sacs", () => {
    const r = redistributeShipment(rows, 2500, 40);
    expect(sum(r, "bags")).toBe(40);
    expect(sum(r, "weight")).toBe(2500);
    expect(r.every((x) => x.bags <= 15)).toBe(true);
  });
  it("refuse plus de 15 sacs par producteur", () => {
    expect(() => redistributeShipment(rows, 3000, 46)).toThrow();
  });
  it("ne dépasse jamais le potentiel disponible", () => {
    const capped = rows.map((x) => ({ ...x, cap: x.weight }));
    expect(() => redistributeShipment(capped, 2100, 32)).toThrow();
  });
});

describe("redistribution du delta sur tous les producteurs", () => {
  it("divise la différence par le nombre de producteurs", () => {
    const r = redistributeShipment(rows, 2300, 32); // +300 / 3 = +100 chacun
    expect(r.map((x) => x.weight)).toEqual([1000, 700, 600]);
  });
  it("baisse répartie sur tous, total exact", () => {
    const r = redistributeShipment(rows, 1901, 32); // -99 → -33 chacun
    expect(r.map((x) => x.weight)).toEqual([867, 567, 467]);
    expect(sum(r, "weight")).toBe(1901);
  });
});
