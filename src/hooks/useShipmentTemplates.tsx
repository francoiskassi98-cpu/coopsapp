import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRegistres } from "@/hooks/useRegistres";
import type { Tables } from "@/integrations/supabase/types";

export type ShipmentTemplate = Tables<"shipment_excel_templates">;

export const SHIPMENT_TEMPLATES_QUERY_KEY = ["shipment_excel_templates"] as const;

/**
 * Modèles de chargement ACTIFS de la coopérative.
 * Un modèle n'est lié ni à un registre ni à une campagne :
 * il est utilisable pour tous les registres et toutes les campagnes.
 */
export function useActiveShipmentTemplates(registreId: string | null | undefined) {
  const { registres, loading: loadingRegistres } = useRegistres();

  const coopId = registres.find((r) => r.id === registreId)?.cooperative_id ?? null;

  const { data = [], isLoading, error } = useQuery({
    queryKey: [...SHIPMENT_TEMPLATES_QUERY_KEY, "active", coopId ?? "none"],
    enabled: !!coopId && !loadingRegistres,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipment_excel_templates")
        .select("*")
        .eq("is_active", true)
        .eq("cooperative_id", coopId as string)
        .order("is_default", { ascending: false })
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("[useActiveShipmentTemplates] échec du chargement des modèles", {
          step: "select shipment_excel_templates",
          coopId,
          code: error.code,
          message: error.message,
        });
        throw error;
      }
      return (data ?? []) as ShipmentTemplate[];
    },
  });

  return { templates: data as ShipmentTemplate[], loading: isLoading || loadingRegistres, error };
}
