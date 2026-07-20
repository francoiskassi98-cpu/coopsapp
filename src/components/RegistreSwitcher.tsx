import { useState } from "react";
import { BookOpen, ChevronsUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useActiveRegistre } from "@/hooks/useActiveRegistre";

/**
 * Sélecteur global de registre — pilote toutes les données métier.
 * Affiche les registres accessibles à l'utilisateur pour la coopérative active.
 */
export default function RegistreSwitcher() {
  const { registres, active, setActive, loading } = useActiveRegistre();
  const [open, setOpen] = useState(false);

  if (loading || registres.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-2 max-w-[220px] border border-border/40 bg-card/40 backdrop-blur hover:bg-card/60"
        >
          <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate text-xs font-medium">{active?.name ?? "Registre"}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1">
        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Registres ({registres.length})
        </div>
        <div className="max-h-72 overflow-y-auto">
          {registres.map((r) => (
            <button
              key={r.id}
              onClick={() => { setActive(r.id); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50 transition-colors text-left",
                r.id === active?.id && "bg-accent/30"
              )}
            >
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate">{r.name}</div>
                {r.code && <div className="text-[10px] text-muted-foreground truncate">{r.code}</div>}
              </div>
              {r.id === active?.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
