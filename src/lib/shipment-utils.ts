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
/** Poids minimal d'un sac (règle métier existante). */
const MIN_BAG_WEIGHT_KG = 10;

/**
 * Répartit `totalBags` (entier) sur des poids entiers, de façon EXACTE :
 * la somme des sacs retournés est toujours égale à `totalBags`.
 * Méthode du plus fort reste, puis rééquilibrage pour respecter le poids max par sac.
 * Retourne `null` si une répartition entière valide est impossible.
 */
export function splitBagsExactly(weights: number[], totalBags: number, maxBagWeight: number): number[] | null {
  const n = weights.length;
  if (n === 0 || !Number.isInteger(totalBags) || totalBags < n) return null;

  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) return null;

  const quotas = weights.map((w) => (w / totalWeight) * totalBags);
  const bags = quotas.map((q) => Math.max(1, Math.floor(q)));
  let diff = totalBags - bags.reduce((s, b) => s + b, 0);

  if (diff > 0) {
    const order = quotas
      .map((q, i) => ({ i, frac: q - Math.floor(q) }))
      .sort((a, b) => b.frac - a.frac);
    let k = 0;
    while (diff > 0) {
      const idx = order[k % n].i;
      // Ne jamais descendre sous le poids minimal par sac.
      if (bags[idx] + 1 <= Math.floor(weights[idx] / MIN_BAG_WEIGHT_KG) || k >= n * 4) {
        bags[idx] += 1;
        diff--;
      }
      k++;
      if (k > n * 8) break;
    }
    if (diff > 0) return null;
  } else if (diff < 0) {
    while (diff < 0) {
      let idx = -1;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        if (bags[i] <= 1) continue;
        const ratio = weights[i] / (bags[i] - 1);
        if (ratio < best) {
          best = ratio;
          idx = i;
        }
      }
      if (idx === -1) return null;
      bags[idx] -= 1;
      diff++;
    }
  }

  // Rééquilibrage : réduire les sacs trop lourds sans changer le total.
  for (let pass = 0; pass < n * 4; pass++) {
    const heavy = bags.findIndex((b, i) => weights[i] / b > maxBagWeight);
    if (heavy === -1) break;
    let donor = -1;
    let bestRatio = Infinity;
    for (let i = 0; i < n; i++) {
      if (i === heavy || bags[i] <= 1) continue;
      const ratio = weights[i] / (bags[i] - 1);
      if (ratio <= maxBagWeight && ratio < bestRatio) {
        bestRatio = ratio;
        donor = i;
      }
    }
    if (donor === -1) break; // meilleur effort : le total reste exact
    bags[donor] -= 1;
    bags[heavy] += 1;
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
