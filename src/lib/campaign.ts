/**
 * Système unique de calcul de campagne.
 * Règle : campagne du 1er septembre au 31 août de l'année suivante.
 * Format : "YYYY-YYYY" (ex : 2026-2027).
 */
export function computeCampaign(date: Date | string | null | undefined): string {
  const d = date ? new Date(date) : new Date();
  if (isNaN(d.getTime())) return currentCampaign();
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-based
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export function currentCampaign(): string {
  return computeCampaign(new Date());
}

/**
 * Normalise n'importe quelle chaîne "campagne" au format "YYYY-YYYY".
 */
export function normalizeCampaign(raw: string | null | undefined): string {
  if (!raw) return "";
  const years = String(raw).match(/(\d{4})/g);
  if (years && years.length >= 2) return `${years[0]}-${years[1]}`;
  return String(raw).trim();
}

/** Liste des campagnes possibles entre deux dates. */
export function campaignsBetween(from?: Date | string | null, to?: Date | string | null): string[] {
  const start = from ? new Date(from) : new Date(new Date().getFullYear() - 3, 8, 1);
  const end = to ? new Date(to) : new Date();
  const set = new Set<string>();
  let cursor = new Date(start.getFullYear(), 8, 1);
  if (start.getMonth() < 8) cursor = new Date(start.getFullYear() - 1, 8, 1);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    set.add(`${y}-${y + 1}`);
    cursor = new Date(y + 1, 8, 1);
  }
  return Array.from(set).sort();
}

/** Vrai durant la première semaine d'une nouvelle campagne (début septembre). */
export function isCampaignStart(): boolean {
  const now = new Date();
  return now.getMonth() === 8 && now.getDate() <= 7;
}
