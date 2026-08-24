import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RegistreRef {
  id: string;
  name: string;
  cooperative_id: string | null;
}

/**
 * Registres accessibles à l'utilisateur connecté.
 * La RLS (my_registre_ids) restreint déjà la liste au périmètre autorisé :
 * - super_admin : tous les registres
 * - coop_admin  : les registres de sa coopérative
 * - agent       : les registres qui lui sont rattachés
 */
export function useRegistres() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["registres", "accessible"],
    queryFn: async (): Promise<RegistreRef[]> => {
      const { data, error } = await supabase
        .from("registres")
        .select("id,name,cooperative_id")
        .order("name");
      if (error) { console.error("[useRegistres]", error); return []; }
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  return { registres: data, loading: isLoading };
}
