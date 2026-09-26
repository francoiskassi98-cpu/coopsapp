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
export const MAX_BAGS_PER_PRODUCER = 15;

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

/** Entier aléatoire dans [a, b]. */
function randInt(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1));
}

/** Mélange aléatoire (Fisher-Yates) d'une liste d'index. */
function shuffledIndexes(n: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/**
 * Répartit `totalBags` sur `n` producteurs : sacs entiers, 1..15, somme exacte.
 * Règle stricte : tous les producteurs d'un même chargement reçoivent le MÊME
 * nombre de sacs. Retourne `null` si `totalBags` n'est pas divisible par `n`
 * ou si la valeur uniforme dépasse 15 sacs.
 */
function allocateBagsUniform(totalBags: number, n: number): number[] | null {
  if (n <= 0 || totalBags < n || totalBags % n !== 0) return null;
  const per = totalBags / n;
  if (per < 1 || per > MAX_BAGS_PER_PRODUCER) return null;
  return Array.from({ length: n }, () => per);
}

/**
 * Repli quasi uniforme (différence maximale de 1 sac) utilisé uniquement
 * lorsqu'aucune répartition strictement uniforme n'est mathématiquement possible.
 */
function allocateBagsNearUniform(totalBags: number, n: number): number[] | null {
  if (n <= 0 || totalBags < n || totalBags > n * MAX_BAGS_PER_PRODUCER) return null;
  const base = Math.floor(totalBags / n);
  let rest = totalBags - base * n;
  const bags = Array.from({ length: n }, () => base);
  for (let i = 0; i < n && rest > 0; i++) {
    if (bags[i] < MAX_BAGS_PER_PRODUCER) {
      bags[i] += 1;
      rest--;
    }
  }
  return rest === 0 ? bags : null;
}

/**
 * Remplit aléatoirement les poids entre les bornes `lo` et `hi` pour atteindre
 * exactement `total`. Le poids/sac de chaque producteur reste donc dans la plage ±5 kg.
 */
function randomFill(lo: number[], hi: number[], total: number): number[] | null {
  const w = [...lo];
  let rest = total - lo.reduce((s, v) => s + v, 0);
  if (rest < 0) return null;
  let guard = 0;
  while (rest > 0) {
    if (guard++ > 1000) return null;
    let moved = false;
    for (const i of shuffledIndexes(w.length)) {
      if (rest <= 0) break;
      const room = hi[i] - w[i];
      if (room <= 0) continue;
      const take = randInt(1, Math.min(room, rest));
      w[i] += take;
      rest -= take;
      moved = true;
    }
    if (!moved) return null;
  }
  return w;
}

/**
 * Distribue le poids d'un chargement entre les producteurs.
 *
 * Règles conservées : 20 % du potentiel de livraison (sans arrondi réducteur),
 * jamais plus que le potentiel restant, minimum 50 kg, maximum 15 sacs par producteur,
 * poids et sacs strictement entiers, sac moyen dynamique ±5 kg, totaux exacts,
 * tri par section A-Z, dates chronologiques, reçus séquentiels.
 *
 * Le poids par sac de chaque producteur est tiré aléatoirement autour du sac moyen
 * (plage ±5 kg) : aucune diversification artificielle +1/-1 n'est appliquée.
 * Retourne [] si une distribution exacte est mathématiquement impossible.
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

  const averageBagWeight = computeAverageBagWeight(totalWeight, totalBags);
  const { min: minBagWeight, max: maxBagWeight } = bagWeightRange(averageBagWeight);
  const minEntryWeight = Math.max(MIN_ALLOCATION_KG, minBagWeight);

  // Capacité individuelle : 20 % du potentiel de livraison (valeur réelle, arrondi supérieur),
  // toujours plafonnée par le potentiel restant du producteur.
  const eligible = producers
    .filter((p) => Math.floor(p.remaining_potential) >= MIN_ALLOCATION_KG)
    .map((p) => ({
      producer: p,
      cap: Math.min(Math.floor(p.remaining_potential), Math.ceil(p.delivery_potential * 0.2)),
    }))
    .filter((e) => e.cap >= minEntryWeight);

  if (eligible.length === 0) return [];

  // Sélection : les producteurs disposant de la plus grande capacité en premier.
  const byCapacity = [...eligible].sort((a, b) => b.cap - a.cap);

  const nMin = Math.max(1, Math.ceil(totalBags / MAX_BAGS_PER_PRODUCER));
  const nMax = Math.min(byCapacity.length, totalBags, Math.floor(totalWeight / minEntryWeight));

  for (let n = nMin; n <= nMax; n++) {
    const chosen = byCapacity.slice(0, n);
    const bags = allocateBags(totalBags, n);
    if (!bags) continue;

    const lo = bags.map((b) => b * minBagWeight);
    const hi = bags.map((b, i) => Math.min(b * maxBagWeight, chosen[i].cap));
    if (hi.some((h, i) => h < lo[i])) continue;
    const sumLo = lo.reduce((s, v) => s + v, 0);
    const sumHi = hi.reduce((s, v) => s + v, 0);
    if (totalWeight < sumLo || totalWeight > sumHi) continue;

    let weights: number[] | null = null;
    for (let attempt = 0; attempt < 8 && !weights; attempt++) {
      weights = randomFill(lo, hi, totalWeight);
    }
    if (!weights) continue;

    // Tri final par section A-Z (règle d'affichage conservée).
    const order = chosen
      .map((e, i) => ({ e, weight: weights![i], bags: bags[i] }))
      .sort((a, b) => a.e.producer.section.localeCompare(b.e.producer.section));

    const totalDays = Math.max(differenceInDays(endDate, startDate), 1);
    const dateStep = totalDays / Math.max(order.length - 1, 1);

    let receiptCounter = lastReceiptNumber;
    const results: DistributionResult[] = order.map((o, i) => {
      receiptCounter++;
      const p = o.e.producer;
      return {
        producer_id: p.id,
        full_name: p.full_name,
        nom: p.nom ?? null,
        prenom: p.prenom ?? null,
        section: p.section,
        plantation_code: p.plantation_code,
        carte_ccc: p.carte_ccc ?? null,
        allocated_weight: o.weight,
        num_bags: o.bags,
        delivery_date: format(addDays(startDate, Math.round(i * dateStep)), "yyyy-MM-dd"),
        receipt_number: String(receiptCounter).padStart(6, "0"),
      };
    });

    const check = verifyDistributionTotals(results, totalWeight, totalBags);
    if (!check.ok) continue;
    const valid = results.every(
      (r, i) =>
        isBagWeightInRange(r.allocated_weight, r.num_bags, averageBagWeight) &&
        r.num_bags <= MAX_BAGS_PER_PRODUCER &&
        r.allocated_weight <= order[i].e.cap
    );
    if (!valid) continue;

    return results;
  }

  return [];
}


// Campagne : source unique de vérité dans `@/lib/campaign`.
export { normalizeCampaign, currentCampaign as getCurrentCampaign, isCampaignStart } from "@/lib/campaign";
