import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, Truck, Building2, Handshake, Inbox } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import type { LucideIcon } from "lucide-react";

type Hit = { id: string; label: string; sub?: string; route: string; icon: LucideIcon };


export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const debounced = useDebounce(q, 250);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!debounced || debounced.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const term = `%${debounced}%`;
      const [{ data: prods }, { data: coops }, { data: parts }, { data: ships }] = await Promise.all([
        supabase.from("producers").select("id, full_name, plantation_code, section").or(`full_name.ilike.${term},plantation_code.ilike.${term}`).is("deleted_at", null).limit(6),
        supabase.from("cooperatives").select("id, name, acronym").or(`name.ilike.${term},acronym.ilike.${term}`).is("deleted_at", null).limit(4),
        supabase.from("partners").select("id, name").ilike("name", term).is("deleted_at", null).limit(4),
        supabase.from("shipments").select("id, connaissement, lot_number, project").or(`connaissement.ilike.${term},lot_number.ilike.${term}`).is("deleted_at", null).limit(6),
      ]);
      if (cancelled) return;
      const list: Hit[] = [
        ...((prods ?? []).map((p) => ({ id: p.id, label: p.full_name, sub: `${p.plantation_code} • ${p.section ?? ""}`, route: "/producteurs", icon: Users }))),
        ...((coops ?? []).map((c) => ({ id: c.id, label: c.name, sub: c.acronym, route: "/gestion", icon: Building2 }))),
        ...((parts ?? []).map((p) => ({ id: p.id, label: p.name, route: "/partenaires", icon: Handshake }))),
        ...((ships ?? []).map((s) => ({ id: s.id, label: s.lot_number || s.connaissement || s.id.slice(0, 8), sub: s.project, route: "/chargements", icon: Truck }))),
      ];
      setHits(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [debounced]);

  const go = (route: string) => {
    setOpen(false);
    setQ("");
    navigate(route);
  };

  const groupBy = (label: string, icon: LucideIcon) => hits.filter((h) => h.icon === icon);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-9 gap-2 text-xs text-muted-foreground w-64 justify-start hidden md:flex"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Rechercher…</span>
        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">⌘K</kbd>
      </Button>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} className="md:hidden">
        <Search className="h-4 w-4" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Producteur, registre, partenaire, chargement…" value={q} onValueChange={setQ} />
        <CommandList>
          {loading && (
            <div className="p-3 space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-[92%]" />
              <Skeleton className="h-9 w-[85%]" />
              <Skeleton className="h-9 w-[95%]" />
            </div>
          )}
          {!loading && debounced.length >= 2 && hits.length === 0 && (
            <CommandEmpty className="py-10">
              <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <div className="rounded-full bg-muted p-3">
                  <Inbox className="h-6 w-6" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">Aucun résultat trouvé</p>
                  <p className="text-xs mt-1">Essayez un autre terme ou vérifiez l’orthographe.</p>
                </div>
              </div>
            </CommandEmpty>
          )}
          {groupBy("Producteurs", Users).length > 0 && (
            <CommandGroup heading="Producteurs">
              {groupBy("Producteurs", Users).map((h) => (
                <CommandItem key={`p-${h.id}`} onSelect={() => go(h.route)}>
                  <Users className="h-3.5 w-3.5 mr-2" /> {h.label}
                  {h.sub && <span className="ml-auto text-[10px] text-muted-foreground">{h.sub}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {groupBy("Registres", Building2).length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Registres">
                {groupBy("Registres", Building2).map((h) => (
                  <CommandItem key={`c-${h.id}`} onSelect={() => go(h.route)}>
                    <Building2 className="h-3.5 w-3.5 mr-2" /> {h.label}
                    {h.sub && <span className="ml-auto text-[10px] text-muted-foreground">{h.sub}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {groupBy("Partenaires", Handshake).length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Partenaires">
                {groupBy("Partenaires", Handshake).map((h) => (
                  <CommandItem key={`pa-${h.id}`} onSelect={() => go(h.route)}>
                    <Handshake className="h-3.5 w-3.5 mr-2" /> {h.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {groupBy("Chargements", Truck).length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Chargements">
                {groupBy("Chargements", Truck).map((h) => (
                  <CommandItem key={`s-${h.id}`} onSelect={() => go(h.route)}>
                    <Truck className="h-3.5 w-3.5 mr-2" /> {h.label}
                    {h.sub && <span className="ml-auto text-[10px] text-muted-foreground">{h.sub}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
