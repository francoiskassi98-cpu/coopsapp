import { useCooperativeContext } from "@/hooks/useCooperativeContext";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";

const STATUS_LABEL: Record<string, { label: string; dot: string; badge: string }> = {
  active:    { label: "Abonnement actif",   dot: "bg-emerald-500",  badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  trial:     { label: "Période d'essai",    dot: "bg-amber-500",    badge: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  expired:   { label: "Abonnement expiré",  dot: "bg-rose-500",     badge: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
  suspended: { label: "Suspendu",           dot: "bg-slate-400",    badge: "bg-slate-400/10 text-slate-500 border-slate-400/30" },
};

export default function CooperativeBanner() {
  const { cooperative, subscription, logoUrl, loading } = useCooperativeContext();
  const { cooperativeRefs, isSuperAdmin } = useAuth();

  if (isSuperAdmin) return null;
  if (loading || !cooperative) return null;

  const status = subscription?.status ?? "trial";
  const meta = STATUS_LABEL[status] ?? STATUS_LABEL.trial;
  const currentRegistre = cooperativeRefs[0]?.name;

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="h-9 w-9 shrink-0 rounded-md bg-muted flex items-center justify-center overflow-hidden border border-border/50">
        {logoUrl ? (
          <img src={logoUrl} alt={cooperative.name} className="h-full w-full object-cover" />
        ) : (
          <Building2 className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-tight truncate">
          {cooperative.name}
          {cooperative.acronym && <span className="ml-1.5 text-muted-foreground font-normal">({cooperative.acronym})</span>}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground truncate">
          {currentRegistre && <span className="truncate">Registre : {currentRegistre}</span>}
          {subscription && (
            <>
              <span>·</span>
              <span>{subscription.plan_name}</span>
              <span>·</span>
              <span>
                {new Date(subscription.start_date).toLocaleDateString("fr-FR")} → {new Date(subscription.end_date).toLocaleDateString("fr-FR")}
              </span>
              <span>·</span>
              <span>{subscription.days_remaining} j restants</span>
            </>
          )}
        </div>
      </div>
      <Badge variant="outline" className={`shrink-0 gap-1.5 ${meta.badge}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </Badge>
    </div>
  );
}
