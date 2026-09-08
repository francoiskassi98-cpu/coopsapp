import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "chunk-reload-at";

/**
 * Charge une page en différé et gère les fichiers obsolètes après un déploiement :
 * si le morceau de code n'existe plus sur le serveur, on recharge la page une fois.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_KEY);
      return mod;
    } catch (error) {
      console.error("[lazyWithRetry] chargement du module échoué", error);
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      // Une seule tentative de rechargement par minute pour éviter les boucles.
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
        // Promesse qui ne se résout jamais : la page se recharge.
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
