/**
 * Permission dédiée : seule la coopérative SOPA peut créer un chargement manuel
 * sur la campagne antérieure 2025-2026 (dates antérieures). Contrôle identique côté serveur
 * dans la RPC create_shipment_with_deliveries.
 */
export const SOPA_COOPERATIVE_ID = "b1fe7036-3aca-4192-9af0-dbc1b79c2cf1";
export const SOPA_BACKDATED_CAMPAIGN = "2025-2026";

export function campaignBounds(label: string): { start: string; end: string } {
  const [y1, y2] = (label.match(/\d{4}/g) ?? []).map(Number);
  return { start: `${y1}-09-01`, end: `${y2}-08-31` };
}

export function canUseBackdatedCampaign(campaign: string, registreCooperativeId: string | null | undefined): boolean {
  return campaign === SOPA_BACKDATED_CAMPAIGN && registreCooperativeId === SOPA_COOPERATIVE_ID;
}
