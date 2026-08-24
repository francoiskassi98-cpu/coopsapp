import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface CooperativeInfo {
  id: string;
  name: string;
  acronym: string | null;
  logo_path: string | null;
  region: string | null;
  city: string | null;
  country: string | null;
  manager_name: string | null;
  president_name: string | null;
}

export interface SubscriptionInfo {
  id: string;
  plan_name: string;
  start_date: string;
  end_date: string;
  status: "trial" | "active" | "expired" | "suspended";
  days_remaining: number;
}

const signedLogo = async (path: string | null): Promise<string | null> => {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage.from("cooperative-logos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
};

const daysBetween = (d: string): number => {
  const end = new Date(d).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / 86_400_000));
};

export function useCooperativeContext() {
  const { cooperativeRefs, isSuperAdmin } = useAuth();
  const [cooperative, setCooperative] = useState<CooperativeInfo | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (isSuperAdmin || cooperativeRefs.length === 0) {
      setCooperative(null); setSubscription(null); setLogoUrl(null); setLoading(false);
      return;
    }
    setLoading(true);
    const coopId = cooperativeRefs[0].id;
    const [{ data: c }, { data: s }, { data: statusData }] = await Promise.all([
      supabase.from("cooperatives").select("id,name,acronym,logo_path,region,city,country,manager_name,president_name").eq("id", coopId).maybeSingle(),
      supabase.from("subscriptions").select("id,plan_name,start_date,end_date,status").eq("cooperative_id", coopId).order("end_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.rpc("get_subscription_status", { _coop_id: coopId }),
    ]);
    setCooperative(c ?? null);
    if (s) {
      setSubscription({
        id: s.id,
        plan_name: s.plan_name,
        start_date: s.start_date,
        end_date: s.end_date,
        status: (statusData as SubscriptionInfo["status"]) ?? s.status,
        days_remaining: daysBetween(s.end_date),
      });
    } else {
      setSubscription(null);
    }
    setLogoUrl(await signedLogo(c?.logo_path ?? null));
    setLoading(false);
  }, [cooperativeRefs, isSuperAdmin]);

  useEffect(() => { load(); }, [load]);

  return { cooperative, subscription, logoUrl, loading, refetch: load, isSuperAdmin };
}
