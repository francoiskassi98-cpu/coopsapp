import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ChevronsUpDown, Check, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface CoopItem { id: string; name: string; logo_path: string | null }

const STORAGE_KEY = "active-cooperative-id";

/**
 * Sélecteur global de coopérative (raccourci de navigation).
 * - super_admin : liste toutes les coopératives.
 * - coop_admin / agent : liste uniquement leurs coopératives.
 * - Charge dynamiquement les logos depuis Supabase Storage (bucket cooperative-logos).
 * - Mémorise la sélection dans localStorage pour toute la session.
 */
export default function CooperativeSwitcher() {
  const navigate = useNavigate();
  const { isSuperAdmin, cooperativeRefs } = useAuth();
  const [coops, setCoops] = useState<CoopItem[]>([]);
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      let list: CoopItem[] = [];
      if (isSuperAdmin) {
        const { data } = await supabase.from("cooperatives").select("id, name, logo_path").order("name");
        list = (data as any) ?? [];
      } else if (cooperativeRefs.length > 0) {
        const ids = cooperativeRefs.map((c) => c.id);
        const { data } = await supabase.from("cooperatives").select("id, name, logo_path").in("id", ids).order("name");
        list = (data as any) ?? [];
      }
      setCoops(list);

      // Résout les URLs signées pour les logos (bucket privé)
      const urls: Record<string, string> = {};
      await Promise.all(list.map(async (c) => {
        if (!c.logo_path) return;
        try {
          const { data } = await supabase.storage.from("cooperative-logos").createSignedUrl(c.logo_path, 3600);
          if (data?.signedUrl) urls[c.id] = data.signedUrl;
        } catch { /* ignore */ }
      }));
      setLogoUrls(urls);

      // Si aucune sélection, prend la première
      if (!activeId && list.length > 0) {
        setActiveId(list[0].id);
        localStorage.setItem(STORAGE_KEY, list[0].id);
      }
    })();
     
  }, [isSuperAdmin, cooperativeRefs]);

  const active = coops.find((c) => c.id === activeId) ?? coops[0];

  const select = (id: string) => {
    setActiveId(id);
    localStorage.setItem(STORAGE_KEY, id);
    setOpen(false);
    window.dispatchEvent(new CustomEvent("active-cooperative-change", { detail: { id } }));
  };

  if (coops.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-2 max-w-[220px] border border-border/40 bg-card/40 backdrop-blur hover:bg-card/60"
        >
          <div className="h-5 w-5 shrink-0 rounded-md bg-muted flex items-center justify-center overflow-hidden">
            {active && logoUrls[active.id] ? (
              <img src={logoUrls[active.id]} alt="" className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
          <span className="truncate text-xs font-medium">{active?.name ?? "Coopérative"}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1">
        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {isSuperAdmin ? `Coopératives (${coops.length})` : "Mes coopératives"}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {coops.map((c) => (
            <button
              key={c.id}
              onClick={() => select(c.id)}
              className={cn(
                "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50 transition-colors text-left",
                c.id === activeId && "bg-accent/30"
              )}
            >
              <div className="h-7 w-7 shrink-0 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                {logoUrls[c.id] ? (
                  <img src={logoUrls[c.id]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
              <span className="flex-1 truncate">{c.name}</span>
              {c.id === activeId && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          ))}
        </div>
        {isSuperAdmin && (
          <>
            <div className="my-1 border-t border-border/40" />
            <button
              onClick={() => { setOpen(false); navigate("/gestion/cooperatives/nouvelle"); }}
              className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-primary hover:bg-primary/10 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Nouvelle coopérative
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
