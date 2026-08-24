import { supabase } from "@/integrations/supabase/client";
import type { ReportPayload, ReportType } from "@/lib/pptx-report-generator";
import { normalizeCampaign } from "@/lib/shipment-utils";

export interface ReportFilters {
  campaignId: string | null;
  campaignName: string;
  cooperatives: string[]; // empty = all the user can see
  project: string | null;
  destination: string | null;
  partnerId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

/** Chargement enrichi des noms de partenaire et de registre. */
interface ShipmentReportRow {
  id: string;
  project: string;
  destination: string;
  connaissement: string | null;
  total_weight: number | string | null;
  created_at: string;
  partners?: { name: string } | null;
  registres?: { name: string } | null;
}

/** Ligne du registre producteurs utilisée pour les statistiques du rapport. */
interface RegistryReportRow {
  section: string;
  potentiel_livraison: number | string | null;
  potentiel_restant: number | string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  cni: string | null;
  surface_cacao_totale: number | string | null;
  registres?: { name: string } | null;
  /** Nom du registre normalisé côté client. */
  cooperative?: string;
}

/** Vue minimale d'un query builder paginable. */
interface RangeableQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}

async function fetchAll<T>(query: RangeableQuery<T>): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  const size = 1000;
  while (true) {
    const { data, error } = await query.range(from, from + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < size) break;
    from += size;
  }
  return out;
}

const num = (v: unknown): number => Number(v ?? 0) || 0;

export async function loadReportData(
  type: ReportType,
  filters: ReportFilters,
  userEmail: string | null,
): Promise<ReportPayload> {
  // Shipments
  let shQ = supabase
    .from("shipments")
    .select("id, project, destination, connaissement, total_weight, created_at, partners(name), registres(name)");
  if (filters.campaignId) shQ = shQ.eq("campaign_label", filters.campaignId);
  if (filters.project) shQ = shQ.eq("project", filters.project);
  if (filters.destination) shQ = shQ.eq("destination", filters.destination);
  if (filters.partnerId) shQ = shQ.eq("partner_id", filters.partnerId);
  // Overlap logic: include shipments whose delivery window touches the period
  if (filters.dateFrom) shQ = shQ.gte("delivery_end", filters.dateFrom);
  if (filters.dateTo) shQ = shQ.lte("delivery_start", filters.dateTo);
  shQ = shQ.eq("is_cancelled", false).order("created_at", { ascending: true });
  let shipments = await fetchAll<ShipmentReportRow>(shQ.returns<ShipmentReportRow[]>());

  // Producer registry (for campaign-specific potential)
  let prQ = supabase
    .from("producer_registry")
    .select("section, potentiel_livraison, potentiel_restant, latitude, longitude, cni, surface_cacao_totale, registres(name)");
  if (filters.campaignId) prQ = prQ.eq("campaign_label", filters.campaignId);
  let registry = (await fetchAll<RegistryReportRow>(prQ.returns<RegistryReportRow[]>())).map((r) => ({
    ...r,
    cooperative: r.registres?.name ?? "",
  }));

  // Cooperatives filter (UI selection)
  const coopSet = new Set(filters.cooperatives.map((c) => c.toLowerCase()));
  if (coopSet.size > 0) {
    shipments = shipments.filter((s) => coopSet.has(String(s.registres?.name ?? "").toLowerCase()));
    registry = registry.filter((r) => coopSet.has(String(r.cooperative ?? "").toLowerCase()));
  }

  // Stats
  const totalPotential = registry.reduce((s, r) => s + num(r.potentiel_livraison), 0);
  const remaining = registry.reduce((s, r) => s + num(r.potentiel_restant), 0);
  const totalDelivered = shipments.reduce((s, sh) => s + num(sh.total_weight), 0);

  // Group helpers
  const groupSum = <T,>(arr: T[], key: (x: T) => string, val: (x: T) => number) => {
    const m: Record<string, number> = {};
    arr.forEach((x) => {
      const k = key(x) || "Inconnu";
      m[k] = (m[k] || 0) + val(x);
    });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const byProject = groupSum(shipments, (s) => s.project, (s) => num(s.total_weight));
  const byDestination = groupSum(shipments, (s) => s.destination, (s) => num(s.total_weight));
  const byPartner = groupSum(shipments, (s) => s.partners?.name || "Inconnu", (s) => num(s.total_weight));

  // Monthly
  const monthlyMap: Record<string, number> = {};
  shipments.forEach((s) => {
    const d = new Date(s.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap[key] = (monthlyMap[key] || 0) + num(s.total_weight);
  });
  const monthly = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }));

  // Coop stats
  const coopPot: Record<string, { potentiel: number; remaining: number }> = {};
  registry.forEach((r) => {
    const k = r.cooperative || "Inconnu";
    if (!coopPot[k]) coopPot[k] = { potentiel: 0, remaining: 0 };
    coopPot[k].potentiel += num(r.potentiel_livraison);
    coopPot[k].remaining += num(r.potentiel_restant);
  });
  const coopDel: Record<string, { delivered: number; count: number }> = {};
  shipments.forEach((s) => {
    const k = s.registres?.name || "Inconnu";
    if (!coopDel[k]) coopDel[k] = { delivered: 0, count: 0 };
    coopDel[k].delivered += num(s.total_weight);
    coopDel[k].count += 1;
  });
  const coopStats = Array.from(new Set([...Object.keys(coopPot), ...Object.keys(coopDel)]))
    .map((name) => ({
      name,
      potentiel: coopPot[name]?.potentiel || 0,
      delivered: coopDel[name]?.delivered || 0,
      remaining: coopPot[name]?.remaining || 0,
      shipmentCount: coopDel[name]?.count || 0,
    }))
    .sort((a, b) => b.delivered - a.delivered);

  // Top sections
  const secMap: Record<string, { potentiel: number; cooperative: string }> = {};
  registry.forEach((r) => {
    const k = `${r.section}__${r.cooperative}`;
    if (!secMap[k]) secMap[k] = { potentiel: 0, cooperative: r.cooperative || "—" };
    secMap[k].potentiel += num(r.potentiel_livraison);
  });
  const topSections = Object.entries(secMap)
    .map(([k, v]) => ({ name: k.split("__")[0], cooperative: v.cooperative, potentiel: v.potentiel }))
    .sort((a, b) => b.potentiel - a.potentiel);

  // Shipments sample
  const shipmentsSample = shipments
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((s) => ({
      connaissement: s.connaissement || "",
      project: s.project,
      partner: s.partners?.name || "—",
      destination: s.destination,
      weight: num(s.total_weight),
      date: new Date(s.created_at).toLocaleDateString("fr-FR"),
    }));

  // Tracability
  const withGps = registry.filter((r) => r.latitude && r.longitude).length;
  const withoutCni = registry.filter((r) => !r.cni || String(r.cni).trim() === "").length;
  const areas = registry.map((r) => num(r.surface_cacao_totale)).filter((n) => n > 0);
  const avgArea = areas.length > 0 ? areas.reduce((s, v) => s + v, 0) / areas.length : 0;

  return {
    type,
    campaign: filters.campaignName ? normalizeCampaign(filters.campaignName) : "—",
    cooperatives: filters.cooperatives,
    userEmail,
    generatedAt: new Date(),
    stats: {
      totalPotential,
      totalDelivered,
      remaining,
      shipmentCount: shipments.length,
      producerCount: registry.length,
    },
    coopStats,
    byProject,
    byDestination,
    byPartner,
    monthly,
    topSections,
    shipmentsSample,
    tracability: {
      totalProducers: registry.length,
      withGps,
      withoutGps: registry.length - withGps,
      withoutCni,
      avgArea,
    },
  };
}
