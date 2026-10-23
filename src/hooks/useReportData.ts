import { supabase } from "@/integrations/supabase/client";
import { normalizeCampaign } from "@/lib/campaign";
import { computeReportMetrics, type RawDelivery, type RawProducer, type RawShipment, type ReportMetrics } from "@/lib/report-metrics";

export interface ReportFilters {
  campaignId: string;
  registreId: string | null; // null = tous les registres accessibles
  dateFrom: string | null;
  dateTo: string | null;
}

export interface ReportPayload {
  campaign: string;
  cooperativeName: string;
  scopeLabel: string;
  registreNames: string[];
  userEmail: string | null;
  generatedAt: Date;
  period: { from: string | null; to: string | null };
  metrics: ReportMetrics;
}

interface RangeableQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}

async function fetchAll<T>(query: RangeableQuery<T>): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await query.range(from, from + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/**
 * Charge les données réelles du rapport (RLS appliquée : seules les données
 * de la coopérative de l'utilisateur sont lisibles). 3 requêtes paginées, sans N+1.
 */
export async function loadReportData(filters: ReportFilters, userEmail: string | null): Promise<ReportPayload> {
  const campaign = normalizeCampaign(filters.campaignId);

  const { data: regs, error: regErr } = await supabase.from("registres").select("id,name,cooperative_id").order("name");
  if (regErr) throw regErr;
  const registreNames: Record<string, string> = {};
  (regs ?? []).forEach((r) => { registreNames[r.id] = r.name; });

  // Chargements officiels : non annulés, non supprimés
  let shQ = supabase
    .from("shipments")
    .select("id, lot_number, connaissement, project, destination, registre_id, total_weight, created_at, delivery_start, partners(name)")
    .eq("campaign_label", campaign)
    .eq("is_cancelled", false)
    .is("deleted_at", null);
  if (filters.registreId) shQ = shQ.eq("registre_id", filters.registreId);
  if (filters.dateFrom) shQ = shQ.gte("delivery_end", filters.dateFrom);
  if (filters.dateTo) shQ = shQ.lte("delivery_start", filters.dateTo);
  type ShRow = Omit<RawShipment, "partner"> & { partners: { name: string } | null };
  const shRows = await fetchAll<ShRow>(shQ.order("created_at").order("id").returns<ShRow[]>());
  const shipments: RawShipment[] = shRows.map((s) => ({ ...s, total_weight: num(s.total_weight), partner: s.partners?.name ?? null }));

  let dQ = supabase
    .from("deliveries")
    .select("id, shipment_id, producer_id, registre_id, net_weight, delivery_date")
    .eq("campaign_label", campaign);
  if (filters.registreId) dQ = dQ.eq("registre_id", filters.registreId);
  type DRow = RawDelivery & { id: string };
  const deliveries = (await fetchAll<DRow>(dQ.order("id").returns<DRow[]>())).map((d) => ({ ...d, net_weight: num(d.net_weight) }));

  let pQ = supabase
    .from("producers")
    .select("id, registre_id, section, full_name, nom, prenom, plantation_code, delivery_potential, remaining_potential, is_active")
    .eq("campaign_label", campaign)
    .is("deleted_at", null);
  if (filters.registreId) pQ = pQ.eq("registre_id", filters.registreId);
  type PRow = { id: string; registre_id: string; section: string; full_name: string; nom: string | null; prenom: string | null; plantation_code: string; delivery_potential: number; remaining_potential: number; is_active: boolean };
  const producers: RawProducer[] = (await fetchAll<PRow>(pQ.order("id").returns<PRow[]>())).map((p) => ({
    id: p.id, registre_id: p.registre_id, section: p.section,
    name: [p.nom, p.prenom].filter(Boolean).join(" ") || p.full_name,
    code: p.plantation_code, delivery_potential: num(p.delivery_potential),
    remaining_potential: num(p.remaining_potential), is_active: p.is_active,
  }));

  const scopeRegistreIds = filters.registreId
    ? [filters.registreId]
    : [...new Set([...producers.map((p) => p.registre_id), ...shipments.map((s) => s.registre_id)])];

  const coopIds = [...new Set((regs ?? []).filter((r) => scopeRegistreIds.includes(r.id)).map((r) => r.cooperative_id).filter(Boolean))] as string[];
  let cooperativeName = "Coopérative";
  if (coopIds.length > 0) {
    const { data: coops } = await supabase.from("cooperatives").select("name").in("id", coopIds);
    if (coops && coops.length) cooperativeName = coops.map((c) => c.name).join(" · ");
  }

  const generatedAt = new Date();
  const metrics = computeReportMetrics({ campaign, now: generatedAt, shipments, deliveries, producers, registreNames, scopeRegistreIds });

  return {
    campaign,
    cooperativeName,
    scopeLabel: filters.registreId ? `Registre ${registreNames[filters.registreId] ?? ""}` : "Tous les registres",
    registreNames: scopeRegistreIds.map((id) => registreNames[id] ?? "Registre inconnu").sort(),
    userEmail,
    generatedAt,
    period: { from: filters.dateFrom, to: filters.dateTo },
    metrics,
  };
}
