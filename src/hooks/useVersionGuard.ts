import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

declare const __BUILD_ID__: string;

const KEY = "app_build_id";
const FORCE_FLAG = "app_forced_relogin";

async function fetchRemoteBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { buildId?: string };
    return json.buildId ?? null;
  } catch {
    return null;
  }
}

async function forceRelogin() {
  try { await supabase.auth.signOut(); } catch (e) { console.error("[version] signOut", e); }
  sessionStorage.setItem(FORCE_FLAG, "1");
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore */ }
  window.location.replace("/auth");
}

/** Déconnecte les utilisateurs après chaque nouvelle publication. */
export function useVersionGuard(hasSession: boolean) {
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const current = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";

    const check = async () => {
      const stored = localStorage.getItem(KEY);
      const remote = await fetchRemoteBuildId();
      if (!hasSession) {
        localStorage.setItem(KEY, remote ?? current);
        return;
      }
      if (!stored) { localStorage.setItem(KEY, remote ?? current); return; }
      if ((remote && remote !== stored) || stored !== current) {
        localStorage.setItem(KEY, remote ?? current);
        await forceRelogin();
      }
    };

    check();
    const id = window.setInterval(check, 5 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [hasSession]);
}

export function consumeForcedReloginFlag(): boolean {
  const v = sessionStorage.getItem(FORCE_FLAG) === "1";
  if (v) sessionStorage.removeItem(FORCE_FLAG);
  return v;
}
