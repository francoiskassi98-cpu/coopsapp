/**
 * Calculs purs du rapport de campagne (sans accès réseau) — testables unitairement.
 * Source des volumes : lignes de livraison officielles (`deliveries.net_weight`)
 * rattachées aux chargements non annulés et non supprimés.
 */

export interface RawShipment {
  id: string;
  lot_number: string | null;
  connaissement: string | null;
  project: string | null;
  destination: string | null;
  registre_id: string;
  total_weight: number;
  created_at: string;
  delivery_start: string | null;
  partner: string | null;
}
export interface RawDelivery {
  shipment_id: string;
  producer_id: string;
  registre_id: string;
  net_weight: number;
  delivery_date: string;
}
export interface RawProducer {
  id: string;
  registre_id: string;
  section: string;
  name: string;
  code: string;
  delivery_potential: number;
  remaining_potential: number;
  is_active: boolean;
}

export interface RegistreMetric {
  id: string; name: string; potential: number; delivered: number; remaining: number;
  shipments: number; producers: number; sections: number; avgPerProducer: number | null; rate: number | null;
}
export interface SectionMetric {
  key: string; name: string; registre: string; producers: number; referenced: number; delivered: number;
  shipments: number; avgPerProducer: number | null; share: number;
}
export interface ShipmentMetric {
  id: string; label: string; date: string; registre: string; project: string; destination: string;
  delivered: number; producers: number; sections: number; avgPerProducer: number | null; declared: number;
}
export interface MonthMetric {
  key: string; label: string; status: "livre" | "sans_livraison" | "a_venir";
  delivered: number; shipments: number; producers: number; variation: number | null;
}
export interface ProducerMetric { id: string; name: string; code: string; section: string; registre: string; delivered: number; deliveries: number }
export interface CategoryMetric { name: string; delivered: number; shipments: number; share: number }

export interface ReportMetrics {
  totals: {
    potential: number; delivered: number; remaining: number; shipments: number;
    producersDelivering: number; producersReferenced: number; activeReferenced: number;
    registresDelivering: number; registresTotal: number; sectionsDelivering: number; sectionsTotal: number;
    rate: number | null; avgPerShipment: number | null; avgPerProducer: number | null; medianPerProducer: number | null;
    declaredShipmentWeight: number; top10Share: number | null;
  };
  registres: RegistreMetric[];
  sections: SectionMetric[];
  shipments: ShipmentMetric[];
  monthly: MonthMetric[];
  producers: ProducerMetric[];
  brackets: Array<{ label: string; count: number; delivered: number }>;
  byProject: CategoryMetric[];
  byDestination: CategoryMetric[];
  labelDuplicates: string[];
  anomalies: string[];
  silentRegistres: string[];
  silentSections: string[];
  neverDeliveredActive: number;
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const n = (v: unknown) => Number(v ?? 0) || 0;
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : null);

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Mois de la campagne « YYYY-YYYY » (1er septembre → 31 août). */
export function campaignMonths(campaign: string): string[] {
  const m = /^(\d{4})-(\d{4})$/.exec(campaign);
  if (!m) return [];
  const y = Number(m[1]);
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const month = (8 + i) % 12; // 8 = septembre
    const year = month >= 8 ? y : y + 1;
    out.push(`${year}-${String(month + 1).padStart(2, "0")}`);
  }
  return out;
}

function categories(shipments: ShipmentMetric[], key: "project" | "destination", total: number): CategoryMetric[] {
  const map = new Map<string, { delivered: number; shipments: number }>();
  shipments.forEach((s) => {
    const k = (s[key] || "").trim() || "Non renseigné";
    const e = map.get(k) ?? { delivered: 0, shipments: 0 };
    e.delivered += s.delivered; e.shipments += 1; map.set(k, e);
  });
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v, share: total > 0 ? (v.delivered / total) * 100 : 0 }))
    .sort((a, b) => b.delivered - a.delivered);
}

export function computeReportMetrics(input: {
  campaign: string;
  now: Date;
  shipments: RawShipment[];
  deliveries: RawDelivery[];
  producers: RawProducer[];
  registreNames: Record<string, string>;
  scopeRegistreIds: string[]; // registres du périmètre
}): ReportMetrics {
  const { shipments: rawSh, producers, registreNames } = input;
  const shipIds = new Set(rawSh.map((s) => s.id));
  const deliveries = input.deliveries.filter((d) => shipIds.has(d.shipment_id));
  const prodById = new Map(producers.map((p) => [p.id, p]));
  const regName = (id: string) => registreNames[id] ?? "Registre inconnu";
  const secOf = (pid: string) => prodById.get(pid)?.section?.trim() || "Section non renseignée";

  const delivered = deliveries.reduce((s, d) => s + n(d.net_weight), 0);
  const potential = producers.reduce((s, p) => s + n(p.delivery_potential), 0);
  const remaining = producers.reduce((s, p) => s + n(p.remaining_potential), 0);

  // Producteurs
  const prodAgg = new Map<string, ProducerMetric>();
  deliveries.forEach((d) => {
    const p = prodById.get(d.producer_id);
    const e = prodAgg.get(d.producer_id) ?? {
      id: d.producer_id, name: p?.name ?? "Producteur hors périmètre", code: p?.code ?? "—",
      section: secOf(d.producer_id), registre: regName(d.registre_id), delivered: 0, deliveries: 0,
    };
    e.delivered += n(d.net_weight); e.deliveries += 1; prodAgg.set(d.producer_id, e);
  });
  const producerList = [...prodAgg.values()].sort((a, b) => b.delivered - a.delivered);
  const pv = producerList.map((p) => p.delivered);

  // Registres
  const regIds = new Set<string>([...input.scopeRegistreIds, ...deliveries.map((d) => d.registre_id)]);
  const registres: RegistreMetric[] = [...regIds].map((id) => {
    const rp = producers.filter((p) => p.registre_id === id);
    const rd = deliveries.filter((d) => d.registre_id === id);
    const pot = rp.reduce((s, p) => s + n(p.delivery_potential), 0);
    const del = rd.reduce((s, d) => s + n(d.net_weight), 0);
    const prods = new Set(rd.map((d) => d.producer_id)).size;
    return {
      id, name: regName(id), potential: pot, delivered: del,
      remaining: rp.reduce((s, p) => s + n(p.remaining_potential), 0),
      shipments: rawSh.filter((s) => s.registre_id === id).length,
      producers: prods, sections: new Set(rd.map((d) => secOf(d.producer_id))).size,
      avgPerProducer: safeDiv(del, prods), rate: pot > 0 ? (del / pot) * 100 : null,
    };
  }).sort((a, b) => b.delivered - a.delivered);

  // Sections
  const secMap = new Map<string, { name: string; registre: string; prods: Set<string>; ships: Set<string>; delivered: number }>();
  deliveries.forEach((d) => {
    const name = secOf(d.producer_id);
    const key = `${d.registre_id}__${name.toLowerCase()}`;
    const e = secMap.get(key) ?? { name, registre: regName(d.registre_id), prods: new Set(), ships: new Set(), delivered: 0 };
    e.prods.add(d.producer_id); e.ships.add(d.shipment_id); e.delivered += n(d.net_weight); secMap.set(key, e);
  });
  const refBySection = new Map<string, number>();
  producers.forEach((p) => {
    const key = `${p.registre_id}__${(p.section?.trim() || "Section non renseignée").toLowerCase()}`;
    refBySection.set(key, (refBySection.get(key) ?? 0) + 1);
  });
  const sections: SectionMetric[] = [...secMap.entries()].map(([key, e]) => ({
    key, name: e.name, registre: e.registre, producers: e.prods.size, referenced: refBySection.get(key) ?? 0,
    delivered: e.delivered, shipments: e.ships.size, avgPerProducer: safeDiv(e.delivered, e.prods.size),
    share: delivered > 0 ? (e.delivered / delivered) * 100 : 0,
  })).sort((a, b) => b.delivered - a.delivered);
  const silentSectionKeys = [...refBySection.keys()].filter((k) => !secMap.has(k));
  const silentSections = silentSectionKeys.map((k) => {
    const [rid, sec] = k.split("__");
    return `${sec.toUpperCase()} (${regName(rid)})`;
  });

  // Chargements
  const shipments: ShipmentMetric[] = rawSh.map((s) => {
    const sd = deliveries.filter((d) => d.shipment_id === s.id);
    const del = sd.reduce((a, d) => a + n(d.net_weight), 0);
    const prods = new Set(sd.map((d) => d.producer_id)).size;
    return {
      id: s.id, label: s.lot_number ? `Lot ${s.lot_number}` : s.connaissement || s.id.slice(0, 8),
      date: s.delivery_start || s.created_at, registre: regName(s.registre_id),
      project: s.project || "", destination: s.destination || "", delivered: del, producers: prods,
      sections: new Set(sd.map((d) => secOf(d.producer_id))).size, avgPerProducer: safeDiv(del, prods),
      declared: n(s.total_weight),
    };
  }).sort((a, b) => a.date.localeCompare(b.date));

  // Mensuel (date de livraison)
  const nowKey = `${input.now.getFullYear()}-${String(input.now.getMonth() + 1).padStart(2, "0")}`;
  const monthKeys = campaignMonths(input.campaign);
  const keys = monthKeys.length ? monthKeys : [...new Set(deliveries.map((d) => d.delivery_date.slice(0, 7)))].sort();
  let prev: number | null = null;
  const monthly: MonthMetric[] = keys.map((key) => {
    const md = deliveries.filter((d) => d.delivery_date.slice(0, 7) === key);
    const del = md.reduce((a, d) => a + n(d.net_weight), 0);
    const status: MonthMetric["status"] = del > 0 ? "livre" : key > nowKey ? "a_venir" : "sans_livraison";
    const variation = status !== "a_venir" && prev !== null && prev > 0 ? ((del - prev) / prev) * 100 : null;
    if (status !== "a_venir") prev = del;
    const [y, m] = key.split("-");
    return {
      key, label: `${MONTHS[Number(m) - 1]} ${y}`, status, delivered: del,
      shipments: new Set(md.map((d) => d.shipment_id)).size, producers: new Set(md.map((d) => d.producer_id)).size, variation,
    };
  });

  // Tranches de volume
  const bounds: Array<[string, number, number]> = [
    ["< 250 kg", 0, 250], ["250 – 500 kg", 250, 500], ["500 – 1 000 kg", 500, 1000],
    ["1 000 – 2 000 kg", 1000, 2000], ["≥ 2 000 kg", 2000, Infinity],
  ];
  const brackets = bounds.map(([label, lo, hi]) => {
    const ps = producerList.filter((p) => p.delivered >= lo && p.delivered < hi);
    return { label, count: ps.length, delivered: ps.reduce((a, p) => a + p.delivered, 0) };
  });

  const byProject = categories(shipments, "project", delivered);
  const byDestination = categories(shipments, "destination", delivered);
  const dup = (list: CategoryMetric[]) => {
    const g = new Map<string, string[]>();
    list.forEach((c) => { const k = c.name.toLowerCase().replace(/\s+/g, " ").trim(); g.set(k, [...(g.get(k) ?? []), c.name]); });
    return [...g.values()].filter((v) => v.length > 1).map((v) => v.join(" / "));
  };

  // Anomalies
  const declared = rawSh.reduce((a, s) => a + n(s.total_weight), 0);
  const anomalies: string[] = [];
  if (Math.round(declared) !== Math.round(delivered))
    anomalies.push(`Écart de ${Math.round(Math.abs(declared - delivered)).toLocaleString("fr-FR")} kg entre le poids déclaré des chargements et la somme des lignes de livraison.`);
  const empty = shipments.filter((s) => s.producers === 0).length;
  if (empty > 0) anomalies.push(`${empty} chargement(s) sans ligne de livraison producteur.`);
  const outOfScope = deliveries.filter((d) => !prodById.has(d.producer_id)).length;
  if (outOfScope > 0) anomalies.push(`${outOfScope} ligne(s) de livraison liées à un producteur absent du registre de la campagne.`);
  const noSection = producers.filter((p) => !p.section?.trim()).length;
  if (noSection > 0) anomalies.push(`${noSection} producteur(s) référencé(s) sans section.`);
  if (potential <= 0) anomalies.push("Potentiel non renseigné : taux de réalisation non calculable.");

  const deliveringIds = new Set(prodAgg.keys());
  const top10 = pv.slice(0, 10).reduce((a, v) => a + v, 0);

  return {
    totals: {
      potential, delivered, remaining, shipments: rawSh.length,
      producersDelivering: deliveringIds.size, producersReferenced: producers.length,
      activeReferenced: producers.filter((p) => p.is_active).length,
      registresDelivering: registres.filter((r) => r.delivered > 0).length, registresTotal: registres.length,
      sectionsDelivering: sections.length, sectionsTotal: refBySection.size,
      rate: potential > 0 ? (delivered / potential) * 100 : null,
      avgPerShipment: safeDiv(delivered, rawSh.length), avgPerProducer: safeDiv(delivered, deliveringIds.size),
      medianPerProducer: median(pv), declaredShipmentWeight: declared,
      top10Share: delivered > 0 && pv.length > 10 ? (top10 / delivered) * 100 : null,
    },
    registres, sections, shipments, monthly, producers: producerList, brackets,
    byProject, byDestination, labelDuplicates: [...dup(byProject), ...dup(byDestination)], anomalies,
    silentRegistres: registres.filter((r) => r.delivered === 0).map((r) => r.name),
    silentSections,
    neverDeliveredActive: producers.filter((p) => p.is_active && !deliveringIds.has(p.id)).length,
  };
}
