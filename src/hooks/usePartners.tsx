import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PartnerRef {
  id: string;
  name: string;
  cooperative_id: string;
  logo_path: string | null;
  status: string;
}

export const PARTNERS_QUERY_KEY = ["partners", "list"] as const;

/**
 * Liste des partenaires accessibles (RLS : coopératives de l'utilisateur).
 * Source unique partagée par les modules Chargements et Détails : évite
 * de refaire la même requête dans chaque composant.
 */
export function usePartners() {
  const queryClient = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: PARTNERS_QUERY_KEY,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PartnerRef[]> => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, name, cooperative_id, logo_path, status")
        .order("name");
      if (error) { console.error("[usePartners]", error); return []; }
      return (data ?? []) as PartnerRef[];
    },
  });

  return {
    partners: data,
    loading: isLoading,
    refreshPartners: () => queryClient.invalidateQueries({ queryKey: PARTNERS_QUERY_KEY }),
  };
}
