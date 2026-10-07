import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRegistres, type RegistreRef } from "@/hooks/useRegistres";

/**
 * Registres réellement utilisés dans une campagne donnée.
 * Un registre appartient à la campagne s'il possède au moins un producteur
 * ou un chargement portant ce `campaign_label`.
 * Si aucun registre n'existe pour la campagne, la liste est vide.
 */
export function useCampaignRegistres(campaign: string | null | undefined) {
  const { registres, loading: loadingRegistres } = useRegistres();

  const { data = [], isLoading } = useQuery({
    queryKey: ["registres", "by-campaign", campaign ?? "none", registres.map((r) => r.id).join(",")],
    enabled: !!campaign && !loadingRegistres,
    staleTime: 60_000,
    queryFn: async (): Promise<RegistreRef[]> => {
      // Une seule requête serveur au lieu de 2 comptages par registre.
      const { data, error } = await supabase.rpc("campaign_registre_ids" as never, {
        p_campaign_label: campaign as string,
      } as never);
      if (error) { console.error("[useCampaignRegistres]", error); return []; }
      const ids = new Set(((data as Array<{ registre_id: string }> | null) ?? []).map((r) => r.registre_id));
      return registres.filter((r) => ids.has(r.id));
    },
  });

  return { registres: data, loading: loadingRegistres || isLoading };
}
