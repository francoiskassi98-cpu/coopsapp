/** Contraintes de persistance, distinctes du sac moyen indicatif arrondi. */
export function validateShipmentBagWeights(
  weight: number,
  bags: number,
  rows?: ReadonlyArray<{ allocated_weight: number; num_bags: number }>,
): string | null {
  const valid = (w: number, b: number) => Number.isInteger(w) && w > 0 && Number.isInteger(b) && b > 0 && w / b >= 10 && w / b <= 110;
  if (!valid(weight, bags)) return "Le poids par sac doit être compris entre 10 et 110 kg. Vérifiez le poids total et le nombre de sacs.";
  if (rows && (rows.length === 0 || rows.some((r) => !valid(r.allocated_weight, r.num_bags)))) return "Chaque livraison doit contenir des sacs et respecter un poids de 10 à 110 kg par sac. Recalculez la distribution.";
  return null;
}