import { format, addDays, differenceInDays } from "date-fns";

export interface ProducerForDistribution {
  id: string;
  /** Nom complet (affichage) : `NOM PRÉNOM`. */
  full_name: string;
  /** Nom (patronyme), conservé séparément jusqu'au fichier Excel. */
  nom?: string | null;
  /** Prénom(s), conservé séparément jusqu'au fichier Excel. */
  prenom?: string | null;
  section: string;
  plantation_code: string;
  /** Carte CCC du producteur (texte brut, issue du registre de la campagne). */
  carte_ccc?: string | null;
  remaining_potential: number;
  delivery_potential: number;
}

export interface DistributionResult {
  producer_id: string;
  full_name: string;
  nom?: string | null;
  prenom?: string | null;
  section: string;
  plantation_code: string;
  carte_ccc?: string | null;
  allocated_weight: number;
  num_bags: number;
  delivery_date: string;
  receipt_number: string;
}

/** Poids minimal attribuable à un producteur (règle métier existante). */
const MIN_ALLOCATION_KG = 50;

/** Nombre maximal de sacs qu'un producteur peut recevoir lors d'une livraison. */
const MAX_BAGS_PER_PRODUCER = 15;

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
    if (l > MAX_BAGS_PER_PRODUCER) return null; // impossible de tenir dans 15 sacs
    const h = Math.min(Math.floor(w / min), MAX_BAGS_PER_PRODUCER);
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
 * Règles conservées : 20 % du potentiel de livraison, solde final si le potentiel restant
 * est inférieur à ce seuil, exclusion sous 50 kg, jamais plus que le potentiel restant,
 * maximum 15 sacs par producteur, tri par section A-Z, dates chronologiques, reçus séquentiels.
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

  // Sac moyen dynamique (arrondi supérieur) et plage autorisée ±5 kg.
  const averageBagWeight = computeAverageBagWeight(totalWeight, totalBags);
  const { min: minBagWeight } = bagWeightRange(averageBagWeight);
  // Poids maximal autorisé pour qu'un producteur puisse être servi en 15 sacs maximum.
  const maxProducerWeight = Math.floor(MAX_BAGS_PER_PRODUCER * minBagWeight);

  const sorted = [...producers]
    .filter((p) => Math.floor(p.remaining_potential) >= MIN_ALLOCATION_KG)
    .sort((a, b) => a.section.localeCompare(b.section));

  // Phase 1 : allocations entières, jamais au-dessus du potentiel restant ni du nombre max de sacs.
  const entries: { producer: ProducerForDistribution; cap: number; maxWeight: number; weight: number }[] = [];
  let left = totalWeight;

  for (const producer of sorted) {
    if (left <= 0) break;
    const cap = Math.floor(producer.remaining_potential);
    const target = Math.floor(producer.delivery_potential * 0.2);
    const desired = Math.min(cap, target, maxProducerWeight);
    let take = Math.min(desired, left);
    if (take < MIN_ALLOCATION_KG) continue;
    // Éviter de laisser un reliquat non attribuable (< 50 kg) sur le dernier producteur (sans dépasser le plafond de sacs).
    const rest = left - take;
    if (rest > 0 && rest < MIN_ALLOCATION_KG && take + rest <= cap && take + rest <= maxProducerWeight) {
      take += rest;
    }
    entries.push({ producer, cap, maxWeight: Math.min(cap, maxProducerWeight), weight: take });
    left -= take;
  }

  // Phase 2 : compléter le reliquat éventuel sur les producteurs déjà servis (dans les limites du potentiel et du max de sacs).
  if (left > 0) {
    for (const e of entries) {
      if (left <= 0) break;
      const room = Math.min(e.cap, e.maxWeight) - e.weight;
      if (room <= 0) continue;
      const add = Math.min(room, left);
      e.weight += add;
      left -= add;
    }
  }

  // Distribution exacte impossible : ni approximation, ni arrondi masquant l'écart.
  if (left !== 0 || entries.length === 0) return [];
  if (entries.length > totalBags) return [];

  const used = new Set(entries.map((e) => e.producer.id));
  const pool = sorted.filter((p) => !used.has(p.id));

  /** Ajoute `amount` kg sur les entrées disposant encore de marge (potentiel/max sacs). Retourne le reliquat. */
  const spread = (amount: number, skip?: number): number => {
    for (let i = 0; i < entries.length && amount > 0; i++) {
      if (i === skip) continue;
      const room = entries[i].maxWeight - entries[i].weight;
      if (room <= 0) continue;
      const add = Math.min(room, amount);
      entries[i].weight += add;
      amount -= add;
    }
    return amount;
  };

  // Phase 2 bis : ajustement du nombre de participants pour que la plage ±5 kg soit réalisable.
  for (let guard = 0; guard < sorted.length * 4 + 16; guard++) {
    if (entries.length === 0) return [];
    const bagsRange = entries.map((e) => {
      const { min, max } = bagWeightRange(averageBagWeight);
      return {
        lo: Math.max(1, Math.ceil(e.weight / max)),
        hi: Math.min(Math.floor(e.weight / min), MAX_BAGS_PER_PRODUCER),
      };
    });
    const badIndex = bagsRange.findIndex((r, i) => r.hi < r.lo || entries[i].weight < minBagWeight);
    const sumLo = bagsRange.reduce((s, r) => s + r.lo, 0);
    const sumHi = bagsRange.reduce((s, r) => s + r.hi, 0);

    if (badIndex !== -1 || sumLo > totalBags) {
      // Trop de participants (ou poids trop faible) : retirer le plus petit et redistribuer son poids.
      const removeIdx =
        badIndex !== -1
          ? badIndex
          : entries.reduce((best, e, i) => (e.weight < entries[best].weight ? i : best), 0);
      const freed = entries[removeIdx].weight;
      if (entries.length === 1) return [];
      const leftover = spread(freed, removeIdx);
      if (leftover !== 0) return [];
      entries.splice(removeIdx, 1);
      continue;
    }

    if (sumHi < totalBags) {
      // Pas assez de sacs possibles : ajouter un producteur en prélevant du poids sur les plus gros.
      const next = pool.shift();
      if (!next) return [];
      const cap = Math.floor(next.remaining_potential);
      const need = Math.min(cap, maxProducerWeight, Math.max(minBagWeight, MIN_ALLOCATION_KG));
      let collected = 0;
      const donors = [...entries].sort((a, b) => b.weight - a.weight);
      for (const d of donors) {
        if (collected >= need) break;
        const spare = d.weight - Math.max(minBagWeight, MIN_ALLOCATION_KG);
        if (spare <= 0) continue;
        const take = Math.min(spare, need - collected);
        d.weight -= take;
        collected += take;
      }
      if (collected < need) {
        // Impossible de financer un participant supplémentaire : remettre le poids prélevé.
        if (collected > 0 && spread(collected) !== 0) return [];
        return [];
      }
      entries.push({ producer: next, cap, maxWeight: Math.min(cap, maxProducerWeight), weight: collected });
      continue;
    }

    break;
  }

  if (entries.reduce((s, e) => s + e.weight, 0) !== totalWeight) return [];

  // Phase 2 ter : diversification des poids — deux producteurs ne doivent jamais
  // recevoir exactement le même poids (le nombre de sacs peut, lui, être identique).
  // Les groupes de poids égaux sont éclatés par des offsets symétriques de somme nulle,
  // ce qui conserve le total exact, le potentiel et la plage ±5 kg.
  const minEntryWeight = Math.max(minBagWeight, MIN_ALLOCATION_KG);
  const upperOf = (e: (typeof entries)[number]) => Math.min(e.cap, e.maxWeight);
  const diversify = (): boolean => {
    const counts = new Map<number, number>();
    for (const e of entries) counts.set(e.weight, (counts.get(e.weight) ?? 0) + 1);
    const bump = (w: number, d: number) => {
      const c = (counts.get(w) ?? 0) + d;
      if (c <= 0) counts.delete(w);
      else counts.set(w, c);
    };
    /** Répartit `-delta` kg sur les autres producteurs (delta>0 : ils perdent, sinon ils gagnent). */
    const compensate = (delta: number, skip: number): boolean => {
      const snap = entries.map((e) => e.weight);
      const snapCounts = new Map(counts);
      let remaining = Math.abs(delta);
      const sign = Math.sign(delta);
      for (let j = 0; j < entries.length && remaining > 0; j++) {
        if (j === skip) continue;
        const room = sign > 0 ? entries[j].weight - minEntryWeight : upperOf(entries[j]) - entries[j].weight;
        if (room <= 0) continue;
        const take = Math.min(room, remaining);
        const nw = entries[j].weight - sign * take;
        if (counts.has(nw)) continue; // ne pas créer de nouveau doublon
        bump(entries[j].weight, -1);
        entries[j].weight = nw;
        bump(nw, 1);
        remaining -= take;
      }
      if (remaining !== 0) {
        entries.forEach((e, k) => (e.weight = snap[k]));
        counts.clear();
        for (const [k, v] of snapCounts) counts.set(k, v);
        return false;
      }
      return true;
    };
    for (let i = 0; i < entries.length; i++) {
      if ((counts.get(entries[i].weight) ?? 0) < 2) continue;
      let fixed = false;
      for (let d = 1; d <= 500 && !fixed; d++) {
        for (const cand of [entries[i].weight + d, entries[i].weight - d]) {
          if (fixed) break;
          if (counts.has(cand)) continue;
          if (cand < minEntryWeight || cand > upperOf(entries[i])) continue;
          const delta = cand - entries[i].weight;
          bump(entries[i].weight, -1);
          entries[i].weight = cand;
          bump(cand, 1);
          if (compensate(delta, i)) fixed = true;
          else {
            bump(cand, -1);
            entries[i].weight = cand - delta;
            bump(cand - delta, 1);
          }
        }
      }
      if (!fixed) return false;
    }
    return counts.size === entries.length;
  };
  if (entries.length > 1 && !diversify()) return [];

  const weights = entries.map((e) => e.weight);
  const bags = splitBagsExactly(weights, totalBags, averageBagWeight);
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
      nom: e.producer.nom ?? null,
      prenom: e.producer.prenom ?? null,
      section: e.producer.section,
      plantation_code: e.producer.plantation_code,
      carte_ccc: e.producer.carte_ccc ?? null,
      allocated_weight: weights[i],
      num_bags: bags[i],
      delivery_date: format(addDays(startDate, Math.round(i * dateStep)), "yyyy-MM-dd"),
      receipt_number: String(receiptCounter).padStart(6, "0"),
    };
  });

  const check = verifyDistributionTotals(results, totalWeight, totalBags);
  if (!check.ok) return [];
  // Contrôle final de la plage ±5 kg autour du sac moyen.
  const inRange = results.every((r) => isBagWeightInRange(r.allocated_weight, r.num_bags, averageBagWeight));
  return inRange ? results : [];
}

// Campagne : source unique de vérité dans `@/lib/campaign`.
export { normalizeCampaign, currentCampaign as getCurrentCampaign, isCampaignStart } from "@/lib/campaign";
