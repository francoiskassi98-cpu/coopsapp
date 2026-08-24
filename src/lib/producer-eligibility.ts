import { supabase } from "@/integrations/supabase/client";
import { normalizeCampaign, getCurrentCampaign } from "@/lib/shipment-utils";
import type { Tables } from "@/integrations/supabase/types";

/** Colonnes producteurs nécessaires au calcul d'éligibilité. */
type ProducerRow = Pick<
  Tables<"producers">,
  "id" | "full_name" | "section" | "plantation_code" | "delivery_potential" | "remaining_potential"
>;
/** Colonnes livraisons nécessaires au calcul d'éligibilité. */
type DeliveryRow = Pick<Tables<"deliveries">, "producer_id" | "net_weight" | "delivery_date">;

/** Règles métier du module Chargements */
export const MIN_REMAINING_WEIGHT_KG = 50;
export const MIN_DAYS_BETWEEN_DELIVERIES = 15;

export interface EligibleProducer {
  id: string;
  full_name: string;
  section: string;
  plantation_code: string;
  delivery_potential: number;
  /** Potentiel − total livré sur la campagne active */
  remaining_potential: number;
  last_delivery_date: string | null;
}

export type ExclusionReason =
  | "potential_reached"
  | "remaining_below_min"
  | "delay_not_elapsed"
  | "no_potential"
  | "section_disabled";

export interface ExcludedProducer {
  id: string;
  full_name: string;
  reason: ExclusionReason;
  message: string;
  eligible_from?: string;
}

export interface EligibilityResult {
  eligible: EligibleProducer[];
  excluded: ExcludedProducer[];
  campaignLabel: string;
  deliveredByProducer: Record<string, number>;
  lastDeliveryByProducer: Record<string, string>;
}

const PAGE = 1000;

function formatDateFr(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR");
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Construit la liste des producteurs éligibles à un chargement.
 * Un producteur est éligible uniquement s'il :
 *  - appartient au registre sélectionné, est actif, campagne active ;
 *  - possède un potentiel > 0 ;
 *  - n'a pas dépassé son potentiel ;
 *  - possède un poids restant >= 50 kg ;
 *  - respecte le délai minimum de 15 jours depuis sa dernière livraison.
 */
export async function buildEligibleProducers(
  registreId: string,
  referenceDate: Date = new Date(),
  campaignLabelInput?: string
): Promise<EligibilityResult> {
  const campaignLabel = normalizeCampaign(campaignLabelInput || getCurrentCampaign());

  // Sections désactivées (registre + campagne active)
  const { data: disabledSectionsData, error: dsError } = await supabase
    .from("disabled_sections")
    .select("section_name")
    .eq("registre_id", registreId)
    .eq("campaign_label", campaignLabel);
  if (dsError) console.error("[producer-eligibility] disabled_sections", dsError);
  const disabledSections = new Set((disabledSectionsData ?? []).map((d) => d.section_name));

  // Producteurs actifs du registre
  let producers: ProducerRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("producers")
      .select("id, full_name, section, plantation_code, delivery_potential, remaining_potential")
      .eq("is_active", true)
      .eq("registre_id", registreId)
      .order("section")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    producers = producers.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Livraisons de la campagne active pour ce registre
  let deliveries: DeliveryRow[] = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("deliveries")
      .select("producer_id, net_weight, delivery_date")
      .eq("registre_id", registreId)
      .eq("campaign_label", campaignLabel)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    deliveries = deliveries.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const deliveredByProducer: Record<string, number> = {};
  const lastDeliveryByProducer: Record<string, string> = {};
  for (const d of deliveries) {
    const pid = d.producer_id;
    if (!pid) continue;
    deliveredByProducer[pid] = (deliveredByProducer[pid] || 0) + Number(d.net_weight || 0);
    if (d.delivery_date && (!lastDeliveryByProducer[pid] || d.delivery_date > lastDeliveryByProducer[pid])) {
      lastDeliveryByProducer[pid] = d.delivery_date;
    }
  }

  const eligible: EligibleProducer[] = [];
  const excluded: ExcludedProducer[] = [];
  const refIso = referenceDate.toISOString().slice(0, 10);

  for (const p of producers) {
    const name = p.full_name || "Producteur";
    if (disabledSections.has(p.section)) {
      excluded.push({ id: p.id, full_name: name, reason: "section_disabled", message: `Le producteur ${name} est exclu car sa section est désactivée.` });
      continue;
    }

    const potential = Number(p.delivery_potential || 0);
    if (potential <= 0) {
      excluded.push({ id: p.id, full_name: name, reason: "no_potential", message: `Le producteur ${name} est exclu car son potentiel est nul.` });
      continue;
    }

    const delivered = deliveredByProducer[p.id] || 0;
    const remaining = potential - delivered;

    if (remaining <= 0) {
      excluded.push({ id: p.id, full_name: name, reason: "potential_reached", message: `Le producteur ${name} a déjà atteint son potentiel pour la campagne active.` });
      continue;
    }

    if (remaining < MIN_REMAINING_WEIGHT_KG) {
      excluded.push({ id: p.id, full_name: name, reason: "remaining_below_min", message: `Le producteur ${name} est exclu car son poids restant est inférieur à ${MIN_REMAINING_WEIGHT_KG} kg.` });
      continue;
    }

    const last = lastDeliveryByProducer[p.id];
    if (last) {
      const eligibleFrom = addDaysIso(last, MIN_DAYS_BETWEEN_DELIVERIES);
      if (refIso < eligibleFrom) {
        excluded.push({
          id: p.id,
          full_name: name,
          reason: "delay_not_elapsed",
          eligible_from: eligibleFrom,
          message: `Le producteur ${name} ne sera éligible qu'à partir du ${formatDateFr(eligibleFrom)}, car le délai minimum de ${MIN_DAYS_BETWEEN_DELIVERIES} jours entre deux livraisons n'est pas encore écoulé.`,
        });
        continue;
      }
    }

    eligible.push({
      id: p.id,
      full_name: name,
      section: p.section || "",
      plantation_code: p.plantation_code || "",
      delivery_potential: potential,
      remaining_potential: remaining,
      last_delivery_date: last || null,
    });
  }

  return { eligible, excluded, campaignLabel, deliveredByProducer, lastDeliveryByProducer };
}

export interface DistributionLine {
  producer_id: string;
  full_name: string;
  allocated_weight: number;
  delivery_date: string;
}

/**
 * Validation finale avant enregistrement : aucun dépassement de potentiel,
 * aucun poids restant < 50 kg, aucun délai de 15 jours non respecté.
 * Retourne la liste des anomalies (vide si tout est conforme).
 */
export async function validateDistributionBeforeSave(
  registreId: string,
  lines: DistributionLine[],
  campaignLabelInput?: string
): Promise<string[]> {
  const { deliveredByProducer, lastDeliveryByProducer } = await buildEligibleProducers(
    registreId,
    new Date(),
    campaignLabelInput
  );

  const potentials: Record<string, { potential: number; name: string }> = {};
  const ids = Array.from(new Set(lines.map((l) => l.producer_id)));
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from("producers")
      .select("id, full_name, delivery_potential")
      .in("id", chunk);
    if (error) throw error;
    (data || []).forEach((p) => {
      potentials[p.id] = { potential: Number(p.delivery_potential || 0), name: p.full_name || "Producteur" };
    });
  }

  const anomalies: string[] = [];
  for (const line of lines) {
    const info = potentials[line.producer_id];
    const name = info?.name || line.full_name || "Producteur";
    const potential = info?.potential ?? 0;
    const delivered = deliveredByProducer[line.producer_id] || 0;
    const remaining = potential - delivered;

    if (remaining < MIN_REMAINING_WEIGHT_KG) {
      anomalies.push(`Le producteur ${name} est exclu car son poids restant est inférieur à ${MIN_REMAINING_WEIGHT_KG} kg.`);
      continue;
    }
    if (delivered + Number(line.allocated_weight) > potential) {
      anomalies.push(`Le producteur ${name} dépasserait son potentiel pour la campagne active (potentiel ${potential} kg, déjà livré ${delivered} kg, volume proposé ${line.allocated_weight} kg).`);
      continue;
    }
    const last = lastDeliveryByProducer[line.producer_id];
    if (last) {
      const eligibleFrom = addDaysIso(last, MIN_DAYS_BETWEEN_DELIVERIES);
      if ((line.delivery_date || new Date().toISOString().slice(0, 10)) < eligibleFrom) {
        anomalies.push(`Le producteur ${name} ne sera éligible qu'à partir du ${formatDateFr(eligibleFrom)}, car le délai minimum de ${MIN_DAYS_BETWEEN_DELIVERIES} jours entre deux livraisons n'est pas encore écoulé.`);
      }
    }
  }

  return anomalies;
}
