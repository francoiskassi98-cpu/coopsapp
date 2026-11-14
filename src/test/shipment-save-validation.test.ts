import { describe, expect, it } from "vitest";
import { validateShipmentBagWeights } from "@/lib/shipment-save-validation";

describe("Validation avant création de chargement", () => {
  it("bloque le lot vide Toulepleu : 4495 kg / 25 sacs", () => {
    expect(validateShipmentBagWeights(4495, 25)).not.toBeNull();
  });
  it("accepte les limites exactes 10 et 110 kg", () => {
    expect(validateShipmentBagWeights(100, 10)).toBeNull();
    expect(validateShipmentBagWeights(1100, 10)).toBeNull();
    expect(validateShipmentBagWeights(99, 10)).not.toBeNull();
    expect(validateShipmentBagWeights(1101, 10)).not.toBeNull();
  });
  it("refuse une distribution vide", () => {
    expect(validateShipmentBagWeights(1000, 15, [])).not.toBeNull();
  });
  it("contrôle chaque livraison indépendamment de la moyenne globale", () => {
    expect(validateShipmentBagWeights(1000, 10, [{ allocated_weight: 900, num_bags: 5 }, { allocated_weight: 100, num_bags: 5 }])).not.toBeNull();
    expect(validateShipmentBagWeights(1000, 10, [{ allocated_weight: 500, num_bags: 5 }, { allocated_weight: 500, num_bags: 5 }])).toBeNull();
  });
});