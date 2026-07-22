import { useCooperativeContext } from "@/hooks/useCooperativeContext";

/**
 * Bloque l'accès aux modules métier lorsque l'abonnement est expiré ou suspendu.
 * Le super_admin n'est jamais bloqué.
 */
export function useSubscriptionGuard() {
  const { subscription, isSuperAdmin, loading } = useCooperativeContext();
  if (isSuperAdmin || loading) return { blocked: false as const, reason: null };
  if (!subscription) return { blocked: false as const, reason: null };
  if (subscription.status === "expired") {
    return { blocked: true as const, reason: "expired" as const, subscription };
  }
  if (subscription.status === "suspended") {
    return { blocked: true as const, reason: "suspended" as const, subscription };
  }
  return { blocked: false as const, reason: null, subscription };
}
