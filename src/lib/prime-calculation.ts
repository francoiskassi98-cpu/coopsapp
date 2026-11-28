export type PrimeDateBasis = "delivery";
export interface PrimePlantation {
  id: string;
  producer_code: string | null;
  full_name: string;
  section: string;
  registre_id: string;
  campaign_label: string;
}
export interface PrimeVolume { producer_id: string; net_weight: number }
export interface PrimeResult {
  producer_id: string;
  producer_code: string;
  full_name: string;
  section: string;
  cooperative: string;
  num_plantations: number;
  volume: number;
  rate: number;
  bonus: number;
  plantations: { producer_id: string; registre_id: string; campaign_label: string; volume: number }[];
}

/** Stop only on an empty page: a server page cap must not truncate a prime. */
export async function fetchPrimePages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const all: T[] = [];
  for (;;) {
    const { data, error } = await fetchPage(all.length, all.length + 499);
    if (error) throw error;
    if (!data?.length) return all;
    all.push(...data);
  }
}

function producerKey(p: PrimePlantation): string {
  return JSON.stringify([p.registre_id, p.campaign_label, p.producer_code?.trim() || p.id]);
}

/** Keep the historical delivery's campaign; never drop it because a producer changed campaign. */
export function calculatePrimeRows(deliveries: PrimeVolume[], plantations: PrimePlantation[], names: Map<string, string>, amount: number, type: "total" | "per_kg", section = "all", producerId = "all"): PrimeResult[] {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount");
  const plants = new Map(plantations.map((p) => [p.id, p]));
  const selected = plants.get(producerId);
  if (producerId !== "all" && !selected) throw new Error("Missing selected producer");
  const volumes = new Map<string, number>();
  for (const d of deliveries) {
    const p = plants.get(d.producer_id);
    if (!p) throw new Error("Missing plantation information");
    if (section !== "all" && p.section !== section) continue;
    if (selected && producerKey(p) !== producerKey(selected)) continue;
    const weight = Number(d.net_weight);
    if (!Number.isFinite(weight) || weight <= 0) throw new Error("Invalid delivery weight");
    volumes.set(p.id, (volumes.get(p.id) ?? 0) + weight);
  }
  const groups = new Map<string, PrimeResult>();
  for (const [id, volume] of volumes) {
    const p = plants.get(id);
    if (!p) throw new Error("Missing plantation");
    const key = producerKey(p);
    let r = groups.get(key);
    if (!r) {
      r = { producer_id: p.id, producer_code: p.producer_code ?? "", full_name: p.full_name, section: p.section, cooperative: names.get(p.registre_id) ?? "", num_plantations: 0, volume: 0, rate: 0, bonus: 0, plantations: [] };
      groups.set(key, r);
    }
    r.volume += volume;
    r.num_plantations++;
    r.plantations.push({ producer_id: id, registre_id: p.registre_id, campaign_label: p.campaign_label, volume });
  }
  const rows = [...groups.values()];
  const total = rows.reduce((sum, r) => sum + r.volume, 0);
  const rate = type === "per_kg" ? amount : total > 0 ? amount / total : 0;
  const sorted = rows.map((r) => ({ ...r, rate, bonus: r.volume * rate })).sort((a, b) => b.volume - a.volume);
  const target = type === "total" ? Math.round(amount) : Math.round(sorted.reduce((s, r) => s + r.bonus, 0));
  const rounded = roundToTotal(sorted.map((r) => r.bonus), target);
  return sorted.map((r, i) => ({ ...r, bonus: rounded[i] }));
}

/** Whole FCFA per row whose sum equals the exact target (largest remainder). */
export function roundToTotal(values: number[], target: number): number[] {
  const floors = values.map((v) => Math.floor(v));
  let rest = target - floors.reduce((s, v) => s + v, 0);
  const order = values.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0 && order.length; k = (k + 1) % order.length, rest--) floors[order[k][1]]++;
  return floors;
}

/** Shipment matches the prime period when its delivery start lies inside it. */
export function primePeriodError(start: string, end: string, campaign: string): string | null {
  if (start > end) return "La date de début doit précéder la date de fin.";
  const years = campaign.match(/^(\d{4})-(\d{4})$/);
  if (!years) return null;
  const cs = `${years[1]}-09-01`, ce = `${years[2]}-08-31`;
  if (start < cs || end > ce) return `La période doit être comprise dans la campagne ${campaign} (${cs} → ${ce}).`;
  return null;
}

/** Persist each plantation's actual share, not a duplicated whole-producer bonus. */
export function primePlantationResults(rows: PrimeResult[]) {
  return rows.flatMap((r) => r.plantations.map((p) => ({ producer_id: p.producer_id, registre_id: p.registre_id, campaign_label: p.campaign_label, volume_delivered: p.volume, rate: r.rate, calculated_bonus: r.volume > 0 ? (r.bonus * p.volume) / r.volume : 0 })));
}