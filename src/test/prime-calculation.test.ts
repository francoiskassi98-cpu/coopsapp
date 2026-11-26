import { describe, expect, it } from "vitest";
import { calculatePrimeRows, fetchPrimePages, primePlantationResults, type PrimePlantation } from "@/lib/prime-calculation";

const plant = (id: string, code = id, register = "r1"): PrimePlantation => ({ id, producer_code: code, registre_id: register, campaign_label: "2026-2027", full_name: id, section: "A" });
const names = new Map([["r1", "Registre 1"]]);
describe("Calcul des primes sans perte de poids", () => {
  it("cumule tous les poids retenus et calcule 35 FCFA/kg", () => {
    const rows = calculatePrimeRows([{ producer_id: "a", net_weight: 40555 }, { producer_id: "b", net_weight: 39000 }, { producer_id: "c", net_weight: 43000 }], [plant("a"), plant("b"), plant("c")], names, 35, "per_kg");
    expect(rows.reduce((s, r) => s + r.volume, 0)).toBe(122555);
    expect(rows.reduce((s, r) => s + r.bonus, 0)).toBe(4289425);
  });
  it("prend toutes les plantations du producteur sélectionné et enregistre leurs parts sans doublon", () => {
    const rows = calculatePrimeRows([{ producer_id: "a", net_weight: 100 }, { producer_id: "b", net_weight: 200 }], [plant("a", "P"), plant("b", "P")], names, 35, "per_kg", "all", "a");
    expect(rows).toHaveLength(1);
    expect(rows[0].volume).toBe(300);
    expect(primePlantationResults(rows).map((r) => [r.producer_id, r.volume_delivered, r.calculated_bonus])).toEqual([["a", 100, 3500], ["b", 200, 7000]]);
  });
  it("ne fusionne pas les mêmes codes de deux registres", () => {
    const rows = calculatePrimeRows([{ producer_id: "a", net_weight: 100 }, { producer_id: "b", net_weight: 200 }], [plant("a", "P"), plant("b", "P", "r2")], names, 35, "per_kg");
    expect(rows).toHaveLength(2);
  });
  it("ne fusionne pas deux campagnes", () => {
    const rows = calculatePrimeRows([{ producer_id: "a", net_weight: 100 }, { producer_id: "b", net_weight: 200 }], [plant("a", "P"), { ...plant("b", "P"), campaign_label: "2025-2026" }], names, 35, "per_kg");
    expect(rows).toHaveLength(2);
  });
  it("répartit une enveloppe selon les volumes", () => {
    const rows = calculatePrimeRows([{ producer_id: "a", net_weight: 100 }, { producer_id: "b", net_weight: 200 }], [plant("a"), plant("b")], names, 3000, "total");
    expect(rows.find((r) => r.producer_id === "a")?.bonus).toBe(1000);
    expect(rows.find((r) => r.producer_id === "b")?.bonus).toBe(2000);
  });
  it("bloque si des informations manquent plutôt que perdre silencieusement du poids", () => {
    expect(() => calculatePrimeRows([{ producer_id: "absent", net_weight: 100 }], [], names, 35, "per_kg")).toThrow();
  });
  it("respecte le filtre section", () => {
    const rows = calculatePrimeRows([{ producer_id: "a", net_weight: 100 }, { producer_id: "b", net_weight: 200 }], [plant("a"), { ...plant("b"), section: "B" }], names, 35, "per_kg", "A");
    expect(rows.reduce((s, r) => s + r.volume, 0)).toBe(100);
  });
  it("ne tronque pas les pages même avec une limite serveur inférieure à 500", async () => {
    const all = Array.from({ length: 1203 }, (_, i) => i);
    expect(await fetchPrimePages<number>(async (from) => ({ data: all.slice(from, from + 137), error: null }))).toEqual(all);
  });
  it("rejette une erreur sur une page suivante sans rendre un résultat partiel", async () => {
    await expect(fetchPrimePages<number>(async (from) => from ? { data: null, error: new Error("offline") } : { data: [1, 2], error: null })).rejects.toThrow("offline");
  });
});