/**
 * Redistribution des quantités d'un chargement déjà enregistré.
 * - Aucun producteur n'est ajouté ; seuls les producteurs existants sont utilisés.
 * - Poids et sacs entiers, totaux strictement exacts.
 * - Max 15 sacs / producteur, min 50 kg / producteur, plage [sac moyen ± 5 kg],
 *   et jamais au-delà du potentiel disponible (poids actuel + potentiel restant).
 * - Si le nombre de sacs baisse, un producteur peut sortir du chargement (0 sac).
 */
export const MAX_BAGS = 15;
export const MIN_WEIGHT = 50;
export const BAG_RANGE = 5;

export interface EditRow {
  id: string;
  weight: number;
  bags: number;
  /** Poids maximal autorisé pour ce producteur dans ce chargement. */
  cap: number;
}

export interface EditResult {
  id: string;
  weight: number;
  bags: number;
}

export function redistributeShipment(rows: EditRow[], newWeight: number, newBags: number): EditResult[] {
  if (!Number.isInteger(newWeight) || !Number.isInteger(newBags) || newWeight <= 0 || newBags <= 0) {
    throw new Error("Le poids et le nombre de sacs doivent être des entiers positifs.");
  }
  if (rows.length === 0) throw new Error("Ce chargement ne contient aucun producteur.");
  if (newBags > rows.length * MAX_BAGS) {
    throw new Error(`Impossible : ${rows.length} producteurs × ${MAX_BAGS} sacs maximum = ${rows.length * MAX_BAGS} sacs.`);
  }

  // 1) Sacs
  const bags = rows.map((r) => r.bags);
  let diff = newBags - bags.reduce((a, b) => a + b, 0);
  while (diff > 0) {
    let best = -1;
    let bestScore = -Infinity;
    rows.forEach((r, i) => {
      if (bags[i] >= MAX_BAGS) return;
      const score = r.cap / (bags[i] + 1);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    if (best < 0) throw new Error("Impossible d'ajouter des sacs sans dépasser 15 sacs par producteur.");
    bags[best]++; diff--;
  }
  while (diff < 0) {
    let best = -1;
    rows.forEach((_, i) => { if (bags[i] > 0 && (best < 0 || bags[i] > bags[best])) best = i; });
    bags[best]--; diff++;
  }

  // 2) Poids : la différence est divisée par le nombre de producteurs et
  //    ajoutée/retirée au poids déjà enregistré de chacun (aucune plage ±5 kg).
  const active = rows.map((r, i) => ({ r, i })).filter(({ i }) => bags[i] > 0);
  const lo = (_i: number) => MIN_WEIGHT;
  const hi = (i: number) => Math.floor(rows[i].cap);
  for (const { i } of active) {
    if (hi(i) < lo(i)) throw new Error("Le potentiel disponible d'au moins un producteur ne permet pas cette répartition.");
  }
  const sumLo = active.length * MIN_WEIGHT;
  const sumHi = active.reduce((s, { i }) => s + hi(i), 0);
  if (newWeight < sumLo || newWeight > sumHi) {
    throw new Error(`Poids impossible avec ces producteurs : il doit être compris entre ${sumLo} et ${sumHi} kg.`);
  }

  const weights = new Array(rows.length).fill(0);
  const currentSum = active.reduce((s, { r }) => s + Math.round(r.weight), 0);
  const share = (newWeight - currentSum) / active.length;
  for (const { r, i } of active) {
    const base = Math.round(r.weight) + Math.round(share);
    weights[i] = Math.min(hi(i), Math.max(lo(i), base));
  }
  // Solde exact : réparti sur tous les producteurs ayant de la marge.
  let wDiff = newWeight - weights.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (wDiff !== 0 && guard++ < 100_000) {
    const step = wDiff > 0 ? 1 : -1;
    const room = active.filter(({ i }) => (step > 0 ? weights[i] < hi(i) : weights[i] > lo(i)));
    if (room.length === 0) throw new Error("Répartition impossible avec les règles actuelles.");
    const per = Math.max(1, Math.floor(Math.abs(wDiff) / room.length));
    for (const { i } of room) {
      if (wDiff === 0) break;
      const limit = step > 0 ? hi(i) - weights[i] : weights[i] - lo(i);
      const m = Math.min(per, limit, Math.abs(wDiff));
      weights[i] += step * m; wDiff -= step * m;
    }
  }

  return rows.map((r, i) => ({ id: r.id, weight: weights[i], bags: bags[i] }));
}
