import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Campaign = {
  id: string;
  nom: string;
  date_debut: string;
  date_fin: string;
  active: boolean;
  utilise_pour_chargement: boolean;
  archived: boolean;
  created_at: string;
};

export function useActiveCampaign() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchActive = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("campaigns" as any)
      .select("*")
      .eq("utilise_pour_chargement", true)
      .maybeSingle();
    setCampaign((data as any) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchActive();
    const channel = supabase
      .channel("campaigns-active")
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns" }, () => fetchActive())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchActive]);

  return { campaign, loading, refetch: fetchActive };
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("campaigns" as any)
      .select("*")
      .order("date_debut", { ascending: false });
    setCampaigns((data as any) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel("campaigns-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns" }, () => fetchAll())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  return { campaigns, loading, refetch: fetchAll };
}
