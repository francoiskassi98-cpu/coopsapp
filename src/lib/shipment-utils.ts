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
  /** Dernière livraison dans la campagne (yyyy-MM-dd), null si aucune. Sert à la rotation. */
  last_delivery_date?: string | null;
  /**
   * Solde disponible pour la saison en cours (grande traite 70 % ou petite traite 100 %).
   * Si fourni, la capacité par chargement est en plus plafonnée par cette valeur.
   */
  season_cap_remaining?: number;
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
 * Répartit `totalBags` sur les producteurs choisis PROPORTIONNELLEMENT à leur
 * capacité (20 % du potentiel, plafonnée par le potentiel restant).
 *
 * - un producteur à forte capacité reçoit naturellement plus de sacs (jusqu'à 15) ;
 * - un producteur à capacité modeste en reçoit moins (4, 6, 8...) ;
 * - sacs entiers, 1..15, somme strictement égale à `totalBags`.
 *
 * Retourne `null` si aucune répartition entière valide n'existe.
 */
function allocateBagsByCapacity(totalBags: number, caps: number[], minBagWeight: number): number[] | null {
  const n = caps.length;
  if (n <= 0 || totalBags < n) return null;

  // Borne haute par producteur : 15 sacs, et jamais plus de sacs que sa capacité
  // ne peut en remplir au poids minimal de la plage ±5 kg.
  const ub = caps.map((c) => Math.min(MAX_BAGS_PER_PRODUCER, Math.floor(c / minBagWeight)));
  if (ub.some((u) => u < 1)) return null;

  const sumUb = ub.reduce((s, v) => s + v, 0);
  if (totalBags > sumUb) return null;

  const sumCap = caps.reduce((s, v) => s + v, 0);
  const bags = caps.map((c, i) => {
    const target = Math.round((totalBags * c) / sumCap);
    return Math.min(ub[i], Math.max(1, target));
  });

  let diff = bags.reduce((s, v) => s + v, 0) - totalBags;

  // Trop de sacs : retirer d'abord aux plus petites capacités.
  if (diff > 0) {
    const order = caps.map((c, i) => i).sort((a, b) => caps[a] - caps[b]);
    let guard = 0;
    while (diff > 0) {
      if (guard++ > n * MAX_BAGS_PER_PRODUCER + 16) return null;
      let moved = false;
      for (const i of order) {
        if (diff <= 0) break;
        if (bags[i] > 1) {
          bags[i] -= 1;
          diff--;
          moved = true;
        }
      }
      if (!moved) return null;
    }
  }

  // Pas assez de sacs : ajouter d'abord aux plus grandes capacités.
  if (diff < 0) {
    const order = caps.map((c, i) => i).sort((a, b) => caps[b] - caps[a]);
    let guard = 0;
    while (diff < 0) {
      if (guard++ > n * MAX_BAGS_PER_PRODUCER + 16) return null;
      let moved = false;
      for (const i of order) {
        if (diff >= 0) break;
        if (bags[i] < ub[i]) {
          bags[i] += 1;
          diff++;
          moved = true;
        }
      }
      if (!moved) return null;
    }
  }

  if (bags.reduce((s, v) => s + v, 0) !== totalBags) return null;

  breakUniformBagRuns(bags, ub);

  return bags.reduce((s, v) => s + v, 0) === totalBags ? bags : null;
}

/**
 * Casse les répétitions de sacs : lorsque plusieurs producteurs se retrouvent
 * avec exactement le même nombre de sacs (potentiels identiques ou très proches),
 * on effectue des transferts 1 pour 1 (+1 ici, -1 là) sous les bornes de chacun.
 *
 * La somme des sacs reste strictement inchangée, chaque valeur reste entière,
 * comprise entre 1 et min(15, capacité disponible).
 */
function breakUniformBagRuns(bags: number[], ub: number[]): void {
  const n = bags.length;
  if (n < 3) return;

  const groupsOf = () => {
    const map = new Map<number, number[]>();
    bags.forEach((v, i) => {
      const list = map.get(v);
      if (list) list.push(i);
      else map.set(v, [i]);
    });
    return map;
  };

  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const [, idx] of groupsOf()) {
      if (idx.length < 3) continue;
      const shuffled = shuffledIndexes(idx.length).map((k) => idx[k]);
      // Transferts par paires : un producteur monte d'un sac, l'autre en cède un.
      for (let k = 0; k + 1 < shuffled.length; k += 2) {
        const up = shuffled[k];
        const down = shuffled[k + 1];
        if (bags[up] + 1 <= ub[up] && bags[down] - 1 >= 1) {
          bags[up] += 1;
          bags[down] -= 1;
          changed = true;
        } else if (bags[down] + 1 <= ub[down] && bags[up] - 1 >= 1) {
          bags[down] += 1;
          bags[up] -= 1;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
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
 * Entrelace, à l'intérieur de chaque section, les producteurs pour éviter des
 * blocs consécutifs de sacs identiques. L'ordre alphabétique des sections est
 * préservé ; seul l'ordre intra-section change.
 *
 * Stratégie : à chaque étape, prendre le producteur du groupe (par nombre de
 * sacs) le plus fréquent parmi les groupes différents du précédent placé.
 * Si un seul groupe reste, on l'utilise (répétitions inévitables uniquement
 * lorsqu'une seule valeur de sacs subsiste dans la section).
 */
function interleaveBagsWithinSections<T extends { bags: number; e: { producer: { section: string } } }>(
  rows: T[]
): T[] {
  const out: T[] = [];
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j < rows.length && rows[j].e.producer.section === rows[i].e.producer.section) j++;
    const groups = new Map<number, T[]>();
    for (let k = i; k < j; k++) {
      const r = rows[k];
      const list = groups.get(r.bags);
      if (list) list.push(r);
      else groups.set(r.bags, [r]);
    }
    let prevBags: number | null = null;
    let remaining = j - i;
    while (remaining > 0) {
      let bestKey: number | null = null;
      let bestSize = -1;
      for (const [key, list] of groups) {
        if (list.length === 0) continue;
        if (key === prevBags) continue;
        if (list.length > bestSize) {
          bestSize = list.length;
          bestKey = key;
        }
      }
      if (bestKey === null) {
        for (const [key, list] of groups) {
          if (list.length > 0) { bestKey = key; break; }
        }
      }
      const list = groups.get(bestKey!)!;
      out.push(list.shift()!);
      prevBags = bestKey;
      remaining--;
    }
    i = j;
  }
  return out;
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

  // Sélection par priorité de rotation :
  // 1) producteurs sans aucune livraison dans la campagne ;
  // 2) puis dernière livraison la plus ancienne ;
  // à priorité égale, la plus grande capacité en premier.
  const byCapacity = [...eligible].sort((a, b) => {
    const la = a.producer.last_delivery_date || "";
    const lb = b.producer.last_delivery_date || "";
    if (la !== lb) {
      if (!la) return -1;
      if (!lb) return 1;
      return la < lb ? -1 : 1;
    }
    return b.cap - a.cap;
  });

  const nMin = Math.max(1, Math.ceil(totalBags / MAX_BAGS_PER_PRODUCER));
  const nMax = Math.min(byCapacity.length, totalBags, Math.floor(totalWeight / minEntryWeight));

  // Sacs répartis proportionnellement à la capacité de chaque producteur :
  // fort potentiel = plus de sacs (jusqu'à 15), potentiel modeste = moins de sacs.
  // On vise en priorité un nombre de participants laissant de la marge autour de
  // ~9 sacs/producteur : avec le minimum de participants, tout le monde serait à 15.
  const nPreferred = Math.min(nMax, Math.max(nMin, Math.ceil(totalBags / 9)));
  const nOrder = Array.from({ length: Math.max(0, nMax - nMin + 1) }, (_, k) => nMin + k).sort(
    (a, b) => Math.abs(a - nPreferred) - Math.abs(b - nPreferred) || a - b
  );

  for (const n of nOrder) {
    const chosen = byCapacity.slice(0, n);
    const bags = allocateBagsByCapacity(totalBags, chosen.map((c) => c.cap), minBagWeight);
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

    // Tri final par section A-Z (règle d'affichage conservée), puis entrelacement
    // à l'intérieur de chaque section pour éviter les blocs de sacs identiques.
    const order = interleaveBagsWithinSections(
      chosen
        .map((e, i) => ({ e, weight: weights![i], bags: bags[i] }))
        .sort((a, b) => a.e.producer.section.localeCompare(b.e.producer.section))
    );


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
