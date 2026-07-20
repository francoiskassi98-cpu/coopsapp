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
  const m = d.getMonth() + 1; // 1..12
  return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/**
 * La campagne est désormais calculée côté système (pas de table).
 * Ce hook retourne uniquement l'étiquette courante pour l'affichage.
 */
export function useActiveCampaign() {
  const label = useMemo(() => computeCampaignLabel(), []);
  const campaign = useMemo(() => ({ nom: label } as Pick<Campaign, "nom">), [label]);
  return { campaign, label, loading: false, refetch: async () => {} };
}
