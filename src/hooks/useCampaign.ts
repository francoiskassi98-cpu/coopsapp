/**
 * Source unique de vérité pour la campagne agricole.
 * La campagne active est calculée par `@/lib/campaign` (1er sept → 31 août).
 * Aucun module ne doit reconstruire la campagne active depuis les chargements.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentCampaign, normalizeCampaign } from "@/lib/campaign";

/** Campagne active (format "YYYY-YYYY"). */
export function useCurrentCampaign(): string {
  return currentCampaign();
}

/**
 * Liste des campagnes historiques disponibles (pour les filtres d'historique
 * uniquement). Mise en cache globalement par React Query : une seule requête
 * partagée entre tous les modules.
 */
export function useCampaignLabels() {
  const active = currentCampaign();

  const { data = [], isLoading } = useQuery({
    queryKey: ["campaign-labels"],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select("campaign_label")
        .not("campaign_label", "is", null)
        .limit(5000);
      if (error) {
        console.error("[useCampaignLabels]", error);
        return [] as string[];
      }
      const set = new Set<string>();
      (data ?? []).forEach((r) => {
        const label = normalizeCampaign(r.campaign_label);
        if (label) set.add(label);
      });
      return Array.from(set);
    },
  });

  const labels = Array.from(new Set([active, ...data])).sort().reverse();
  return { labels, activeCampaign: active, isLoading };
}
