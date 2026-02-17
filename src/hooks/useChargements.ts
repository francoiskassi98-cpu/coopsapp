import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface Chargement {
  id: string; // delivery id
  shipment_id: string;
  connaissement: string;
  nom_planteur: string;
  code_plantation: string;
  numero_recu: string;
  zone: string;
  projet: string;
  campagne: string;
  destination: string;
  date_livraison: string;
  poids_net: number;
  nombre_sacs: number;
  partenaire: string;
  section: string;
}

async function fetchAllPaginated(queryBuilder: any) {
  let allData: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await queryBuilder.range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allData;
}

async function fetchChargements(): Promise<Chargement[]> {
  const deliveries = await fetchAllPaginated(
    supabase
      .from("deliveries")
      .select("*, producers(full_name, plantation_code, section), shipments(connaissement, zone, project, campaign, destination, partner_id, partners(name))")
      .order("created_at", { ascending: false })
  );

  return deliveries.map((d: any) => ({
    id: d.id,
    shipment_id: d.shipment_id,
    connaissement: d.shipments?.connaissement || "—",
    nom_planteur: d.producers?.full_name || "—",
    code_plantation: d.producers?.plantation_code || "",
    numero_recu: d.receipt_number,
    zone: d.shipments?.zone || "—",
    projet: d.shipments?.project || "",
    campagne: d.shipments?.campaign || "",
    destination: d.shipments?.destination || "",
    date_livraison: d.delivery_date,
    poids_net: Number(d.net_weight),
    nombre_sacs: d.num_bags,
    partenaire: d.shipments?.partners?.name || "—",
    section: d.producers?.section || "",
  }));
}

export function useChargements() {
  return useQuery({
    queryKey: ["chargements"],
    queryFn: fetchChargements,
  });
}

export function useDeleteChargement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deliveries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chargements"] });
      toast({ title: "Livraison supprimée" });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateChargement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (chargement: Partial<Chargement> & { id: string }) => {
      const { error } = await supabase
        .from("deliveries")
        .update({
          net_weight: chargement.poids_net,
          num_bags: chargement.nombre_sacs,
          delivery_date: chargement.date_livraison,
          receipt_number: chargement.numero_recu,
        })
        .eq("id", chargement.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chargements"] });
      toast({ title: "Livraison modifiée" });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteByConnaissement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (connaissement: string) => {
      // Find shipments with this connaissement
      const { data: shipments } = await supabase
        .from("shipments")
        .select("id")
        .eq("connaissement", connaissement);
      if (!shipments || shipments.length === 0) throw new Error("Aucun chargement trouvé");
      
      const shipmentIds = shipments.map((s) => s.id);
      
      // Delete deliveries for these shipments
      for (let i = 0; i < shipmentIds.length; i += 500) {
        const chunk = shipmentIds.slice(i, i + 500);
        const { error } = await supabase.from("deliveries").delete().in("shipment_id", chunk);
        if (error) throw error;
      }
      
      // Delete the shipments
      for (let i = 0; i < shipmentIds.length; i += 500) {
        const chunk = shipmentIds.slice(i, i + 500);
        // First cancel them (since we can't delete shipments per RLS)
        const { error } = await supabase
          .from("shipments")
          .update({ status: "deleted" })
          .in("id", chunk);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chargements"] });
      toast({ title: "Chargement supprimé par connaissement" });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });
}
