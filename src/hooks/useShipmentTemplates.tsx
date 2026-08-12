import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRegistres } from "@/hooks/useRegistres";

export const SHIPMENT_TEMPLATES_QUERY_KEY = ["shipment_excel_templates"] as const;

/**
 * Modèles de chargement ACTIFS disponibles pour la coopérative du registre sélectionné.
 * Un modèle rattaché à un autre registre de la même coopérative reste disponible,
 * de même qu'un modèle sans registre (portée coopérative).
 */
export function useActiveShipmentTemplates(registreId: string | null | undefined) {
  const { registres, loading: loadingRegistres } = useRegistres();

  const coopId = registres.find((r) => r.id === registreId)?.cooperative_id ?? null;
  const scopeIds = coopId
    ? registres.filter((r) => r.cooperative_id === coopId).map((r) => r.id)
    : registreId
      ? [registreId]
      : [];

  const { data = [], isLoading, error } = useQuery({
    queryKey: [...SHIPMENT_TEMPLATES_QUERY_KEY, "active", coopId ?? registreId ?? "none", scopeIds.join(",")],
    enabled: !!registreId && !loadingRegistres,
    staleTime: 30_000,
    queryFn: async () => {
      const orFilter = scopeIds.length
        ? `registre_id.in.(${scopeIds.join(",")}),registre_id.is.null`
        : `registre_id.is.null`;

      const { data, error } = await (supabase as any)
        .from("shipment_excel_templates")
        .select("*")
        .eq("is_active", true)
        .or(orFilter)
        .order("is_default", { ascending: false })
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("[useActiveShipmentTemplates] échec du chargement des modèles", {
          step: "select shipment_excel_templates",
          registreId,
          coopId,
          scopeIds,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }
      return (data ?? []) as any[];
    },
  });

  return { templates: data as any[], loading: isLoading || loadingRegistres, error };
}
