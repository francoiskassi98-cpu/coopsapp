/**
 * Compatibility shim — l'ancienne notion de « campagne DB » a été remplacée par le
 * champ `campaign_label` (texte "YYYY-YYYY") calculé automatiquement. Ce hook expose
 * la même API que l'ancien `useActiveCampaign` pour éviter de casser les écrans.
 * `id` et `nom` valent tous les deux le label texte.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { currentCampaign } from "@/lib/campaign";

export interface CampaignLike {
  id: string;
  nom: string;
  utilise_pour_chargement: boolean;
}

const toCampaign = (label: string, active = false): CampaignLike => ({
  id: label, nom: label, utilise_pour_chargement: active,
});

export function useActiveCampaign() {
  const current = currentCampaign();
  return { campaign: toCampaign(current, true) };
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<CampaignLike[]>([toCampaign(currentCampaign(), true)]);

  useEffect(() => {
    (async () => {
      const set = new Set<string>();
      set.add(currentCampaign());
      const { data } = await (supabase as any)
        .from("shipments")
        .select("campaign_label")
        .not("campaign_label", "is", null)
        .limit(2000);
      (data || []).forEach((r: any) => { if (r.campaign_label) set.add(r.campaign_label); });
      const active = currentCampaign();
      setCampaigns(Array.from(set).sort().reverse().map((l) => toCampaign(l, l === active)));
    })();
  }, []);

  return { campaigns };
}
