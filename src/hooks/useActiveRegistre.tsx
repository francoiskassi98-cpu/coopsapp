import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Registre {
  id: string;
  cooperative_id: string;
  name: string;
  code: string | null;
  responsable: string | null;
  phone: string | null;
  address: string | null;
  status: string;
}

const STORAGE_KEY_COOP = "active-cooperative-id";
const STORAGE_KEY_REG = "active-registre-id";

interface Ctx {
  registres: Registre[];
  active: Registre | null;
  activeCoopId: string | null;
  loading: boolean;
  setActive: (id: string) => void;
  refetch: () => Promise<void>;
}

const RegistreContext = createContext<Ctx>({
  registres: [], active: null, activeCoopId: null, loading: true,
  setActive: () => {}, refetch: async () => {},
});

export function ActiveRegistreProvider({ children }: { children: ReactNode }) {
  const { session, isSuperAdmin, cooperativeRefs } = useAuth();
  const [activeCoopId, setActiveCoopId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY_COOP)
  );
  const [registres, setRegistres] = useState<Registre[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY_REG)
  );
  const [loading, setLoading] = useState(false);

  // Écoute les changements de coopérative sélectionnée dans le header
  useEffect(() => {
    const onCoopChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string };
      setActiveCoopId(detail.id);
      setActiveId(null);
      localStorage.removeItem(STORAGE_KEY_REG);
    };
    window.addEventListener("active-cooperative-change", onCoopChange);
    return () => window.removeEventListener("active-cooperative-change", onCoopChange);
  }, []);

  // Fallback : si pas de coop active, prend la première dispo
  useEffect(() => {
    if (activeCoopId) return;
    if (!isSuperAdmin && cooperativeRefs.length > 0) {
      setActiveCoopId(cooperativeRefs[0].id);
      localStorage.setItem(STORAGE_KEY_COOP, cooperativeRefs[0].id);
    }
  }, [activeCoopId, isSuperAdmin, cooperativeRefs]);

  const fetchRegistres = useCallback(async () => {
    if (!session) { setRegistres([]); return; }
    setLoading(true);
    try {
      let query = (supabase.from as any)("registres")
        .select("id, cooperative_id, name, code, responsable, phone, address, status")
        .eq("status", "active")
        .order("name");
      if (activeCoopId) query = query.eq("cooperative_id", activeCoopId);
      const { data, error } = await query;
      if (error) throw error;
      const list = (data ?? []) as Registre[];
      setRegistres(list);
      if (list.length > 0 && !list.find((r) => r.id === activeId)) {
        setActiveId(list[0].id);
        localStorage.setItem(STORAGE_KEY_REG, list[0].id);
      } else if (list.length === 0) {
        setActiveId(null);
        localStorage.removeItem(STORAGE_KEY_REG);
      }
    } catch (e) {
      console.error("[useActiveRegistre] fetch", e);
      setRegistres([]);
    } finally {
      setLoading(false);
    }
  }, [session, activeCoopId, activeId]);

  useEffect(() => { fetchRegistres(); }, [fetchRegistres]);

  const setActive = (id: string) => {
    setActiveId(id);
    localStorage.setItem(STORAGE_KEY_REG, id);
    window.dispatchEvent(new CustomEvent("active-registre-change", { detail: { id } }));
  };

  const active = registres.find((r) => r.id === activeId) ?? null;

  return (
    <RegistreContext.Provider value={{ registres, active, activeCoopId, loading, setActive, refetch: fetchRegistres }}>
      {children}
    </RegistreContext.Provider>
  );
}

export const useActiveRegistre = () => useContext(RegistreContext);
