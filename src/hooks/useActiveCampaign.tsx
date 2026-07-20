import { useMemo } from "react";

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

/**
 * Calcule automatiquement l'étiquette de campagne pour une date donnée.
 * Cycle : 1er septembre AAAA → 31 août AAAA+1.
 */
export function computeCampaignLabel(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function buildCampaign(label: string): Campaign {
  const [start, end] = label.split("-").map((v) => parseInt(v, 10));
  return {
    id: label,
    nom: label,
    date_debut: `${start}-09-01`,
    date_fin: `${end}-08-31`,
    active: true,
    utilise_pour_chargement: true,
    archived: false,
    created_at: new Date().toISOString(),
  };
}

/** La campagne courante est calculée par le système (plus de table campaigns). */
export function useActiveCampaign() {
  const label = useMemo(() => computeCampaignLabel(), []);
  const campaign = useMemo(() => buildCampaign(label), [label]);
  return { campaign, label, loading: false, refetch: async () => {} };
}

/**
 * Compat rétro : renvoie la campagne courante + la précédente,
 * pour les écrans qui listent encore les campagnes en attendant leur refonte.
 */
export function useCampaigns() {
  const campaigns = useMemo(() => {
    const now = computeCampaignLabel();
    const [start] = now.split("-").map((v) => parseInt(v, 10));
    const prev = `${start - 1}-${start}`;
    return [buildCampaign(now), buildCampaign(prev)];
  }, []);
  return { campaigns, loading: false, refetch: async () => {} };
}
