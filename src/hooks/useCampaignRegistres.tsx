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
      const results = await Promise.all(
        registres.map(async (r) => {
          const [prod, ship] = await Promise.all([
            supabase
              .from("producers")
              .select("id", { count: "exact", head: true })
              .eq("registre_id", r.id)
              .eq("campaign_label", campaign as string),
            supabase
              .from("shipments")
              .select("id", { count: "exact", head: true })
              .eq("registre_id", r.id)
              .eq("campaign_label", campaign as string),
          ]);
          return (prod.count ?? 0) > 0 || (ship.count ?? 0) > 0 ? r : null;
        })
      );
      return results.filter((r): r is RegistreRef => r !== null);
    },
  });

  return { registres: data, loading: loadingRegistres || isLoading };
}
