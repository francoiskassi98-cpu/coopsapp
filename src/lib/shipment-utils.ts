import { format, addDays, differenceInDays } from "date-fns";

export interface ProducerForDistribution {
  id: string;
  full_name: string;
  section: string;
  plantation_code: string;
  remaining_potential: number;
  delivery_potential: number;
}

export interface DistributionResult {
  producer_id: string;
  full_name: string;
  section: string;
  plantation_code: string;
  allocated_weight: number;
  num_bags: number;
  delivery_date: string;
  receipt_number: string;
}

/** Poids minimal attribuable à un producteur (règle métier existante). */
const MIN_ALLOCATION_KG = 50;

/** Tolérance autorisée autour du sac moyen, en kg (plage ±5 kg). */
export const BAG_WEIGHT_TOLERANCE_KG = 5;

/**
 * Sac moyen = POIDS TOTAL DÉCLARÉ / NOMBRE DE SACS DÉCLARÉ, arrondi à l'entier supérieur.
 * Aucune limite fixe (ni 10 kg, ni 35 kg, ni 90 kg) : la valeur est purement dynamique.
 */
export function computeAverageBagWeight(totalWeight: number, totalBags: number): number {
  if (!(totalWeight > 0) || !(totalBags > 0)) return 0;
  return Math.ceil(totalWeight / totalBags);
}

/** Plage autorisée du poids par sac d'un producteur : sac moyen ±5 kg. */
export function bagWeightRange(averageBagWeight: number): { min: number; max: number } {
  return {
    min: Math.max(1, averageBagWeight - BAG_WEIGHT_TOLERANCE_KG),
    max: averageBagWeight + BAG_WEIGHT_TOLERANCE_KG,
  };
}

/** Vrai si le poids par sac du producteur respecte la plage sac moyen ±5 kg. */
export function isBagWeightInRange(weight: number, bags: number, averageBagWeight: number): boolean {
  if (!(bags > 0)) return false;
  const { min, max } = bagWeightRange(averageBagWeight);
  const perBag = weight / bags;
  return perBag >= min && perBag <= max;
}

/**
 * Répartit `totalBags` (entier) sur des poids entiers, de façon EXACTE :
 * la somme des sacs retournés est toujours égale à `totalBags`, et le poids par sac
 * de chaque producteur reste dans la plage sac moyen ±5 kg.
 * Retourne `null` si une répartition entière valide est impossible.
 */
export function splitBagsExactly(weights: number[], totalBags: number, averageBagWeight: number): number[] | null {
  const n = weights.length;
  if (n === 0 || !Number.isInteger(totalBags) || totalBags < n) return null;
  const { min, max } = bagWeightRange(averageBagWeight);

  const lo: number[] = [];
  const hi: number[] = [];
  for (const w of weights) {
    if (!Number.isInteger(w) || w <= 0) return null;
    const l = Math.max(1, Math.ceil(w / max));
    const h = Math.floor(w / min);
    if (h < l) return null; // poids incompatible avec la plage ±5 kg
    lo.push(l);
    hi.push(h);
  }

  const sumLo = lo.reduce((s, v) => s + v, 0);
  const sumHi = hi.reduce((s, v) => s + v, 0);
  if (totalBags < sumLo || totalBags > sumHi) return null;

  const bags = [...lo];
  let rest = totalBags - sumLo;
  // Répartir les sacs restants sur les producteurs qui disposent encore de marge.
  while (rest > 0) {
    let moved = false;
    for (let i = 0; i < n && rest > 0; i++) {
      if (bags[i] < hi[i]) {
        bags[i] += 1;
        rest--;
        moved = true;
      }
    }
    if (!moved) return null;
  }

  return bags.reduce((s, b) => s + b, 0) === totalBags ? bags : null;
}


/** Vérifie qu'une distribution est strictement entière et exactement égale aux totaux déclarés. */
export function verifyDistributionTotals(
  lines: { allocated_weight: number; num_bags: number }[],
  totalWeight: number,
  totalBags: number
): { ok: boolean; weightSum: number; bagSum: number; reason?: string } {
  const weightSum = lines.reduce((s, l) => s + Number(l.allocated_weight), 0);
  const bagSum = lines.reduce((s, l) => s + Number(l.num_bags), 0);
  const allInteger = lines.every(
    (l) => Number.isInteger(Number(l.allocated_weight)) && Number.isInteger(Number(l.num_bags)) && Number(l.num_bags) > 0
  );
  if (!allInteger) return { ok: false, weightSum, bagSum, reason: "decimal" };
  if (weightSum !== totalWeight || bagSum !== totalBags) return { ok: false, weightSum, bagSum, reason: "mismatch" };
  return { ok: true, weightSum, bagSum };
}

/**
 * Distribue le poids d'un chargement entre les producteurs.
 * Règles conservées : 40 % du potentiel de livraison, solde final si le potentiel restant
 * est inférieur à ce seuil, exclusion sous 50 kg, jamais plus que le potentiel restant,
 * tri par section A-Z, dates chronologiques, reçus séquentiels.
 *
 * Garanties strictes ajoutées :
 * - tous les poids et sacs sont des ENTIERS ;
 * - SUM(poids) === totalWeight et SUM(sacs) === totalBags, sans approximation ;
 * - retourne [] si une distribution exacte est impossible.
 */
export function distributeShipment(
  producers: ProducerForDistribution[],
  totalWeight: number,
  totalBags: number,
  startDate: Date,
  endDate: Date,
  lastReceiptNumber: number
): DistributionResult[] {
  if (!Number.isInteger(totalWeight) || !Number.isInteger(totalBags) || totalWeight <= 0 || totalBags <= 0) return [];

  const avgBagWeight = totalWeight / totalBags;
  const maxBagWeight = avgBagWeight * 1.1;

  const sorted = [...producers]
    .filter((p) => Math.floor(p.remaining_potential) >= MIN_ALLOCATION_KG)
    .sort((a, b) => a.section.localeCompare(b.section));

  // Phase 1 : allocations entières, jamais au-dessus du potentiel restant.
  const entries: { producer: ProducerForDistribution; cap: number; weight: number }[] = [];
  let left = totalWeight;

  for (const producer of sorted) {
    if (left <= 0) break;
    const cap = Math.floor(producer.remaining_potential);
    const target = Math.floor(producer.delivery_potential * 0.4);
    const desired = Math.min(cap, cap < target ? cap : target);
    let take = Math.min(desired, left);
    if (take < MIN_ALLOCATION_KG) continue;
    // Éviter de laisser un reliquat non attribuable (< 50 kg) sur le dernier producteur.
    const rest = left - take;
    if (rest > 0 && rest < MIN_ALLOCATION_KG && take + rest <= cap) {
      take += rest;
    }
    entries.push({ producer, cap, weight: take });
    left -= take;
  }

  // Phase 2 : compléter le reliquat éventuel sur les producteurs déjà servis (dans la limite du potentiel).
  if (left > 0) {
    for (const e of entries) {
      if (left <= 0) break;
      const room = e.cap - e.weight;
      if (room <= 0) continue;
      const add = Math.min(room, left);
      e.weight += add;
      left -= add;
    }
  }

  // Distribution exacte impossible : ni approximation, ni arrondi masquant l'écart.
  if (left !== 0 || entries.length === 0) return [];
  if (entries.length > totalBags) return [];

  const weights = entries.map((e) => e.weight);
  const bags = splitBagsExactly(weights, totalBags, maxBagWeight);
  if (!bags) return [];

  // Phase 3 : dates chronologiques (règle existante).
  const totalDays = Math.max(differenceInDays(endDate, startDate), 1);
  const dateStep = totalDays / Math.max(entries.length - 1, 1);

  let receiptCounter = lastReceiptNumber;
  const results: DistributionResult[] = entries.map((e, i) => {
    receiptCounter++;
    return {
      producer_id: e.producer.id,
      full_name: e.producer.full_name,
      section: e.producer.section,
      plantation_code: e.producer.plantation_code,
      allocated_weight: weights[i],
      num_bags: bags[i],
      delivery_date: format(addDays(startDate, Math.round(i * dateStep)), "yyyy-MM-dd"),
      receipt_number: String(receiptCounter).padStart(6, "0"),
    };
  });

  const check = verifyDistributionTotals(results, totalWeight, totalBags);
  return check.ok ? results : [];
}

// Campagne : source unique de vérité dans `@/lib/campaign`.
export { normalizeCampaign, currentCampaign as getCurrentCampaign, isCampaignStart } from "@/lib/campaign";
