import { useCooperativeContext } from "@/hooks/useCooperativeContext";
import { useAuth } from "@/hooks/useAuth";
import { Building2 } from "lucide-react";
import { currentCampaign } from "@/lib/campaign";

function Segment({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "muted" | "primary" | "success" | "warning" | "danger" }) {
  const toneCls: Record<string, string> = {
    muted:   "text-foreground",
    primary: "text-primary",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger:  "text-rose-600",
  };
  return (
    <div className="flex flex-col min-w-0 px-4 border-l border-border/60 first:border-l-0 first:pl-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-tight">{label}</span>
      <span className={`text-sm font-semibold truncate ${toneCls[tone ?? "muted"]}`}>{value}</span>
    </div>
  );
}

export default function CooperativeBanner() {
  const { cooperative, subscription, logoUrl, loading } = useCooperativeContext();
  const { cooperativeRefs, isSuperAdmin } = useAuth();

  if (isSuperAdmin) return null;
  if (loading || !cooperative) return null;

  const currentRegistre = cooperativeRefs[0]?.name ?? "—";
  const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
  const daysTone: "success" | "warning" | "danger" =
    !subscription ? "warning" :
    subscription.days_remaining <= 7 ? "danger" :
    subscription.days_remaining <= 30 ? "warning" : "success";

  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <div className="h-11 w-11 shrink-0 rounded-xl bg-muted flex items-center justify-center overflow-hidden ring-1 ring-border">
        {logoUrl ? (
          <img src={logoUrl} alt={cooperative.name} className="h-full w-full object-cover" />
        ) : (
          <Building2 className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex items-stretch gap-0 min-w-0 overflow-x-auto">
        <Segment label="Coopérative" value={cooperative.acronym || cooperative.name} />
        <Segment label="Registre actif" value={currentRegistre} tone="primary" />
        <Segment label="Campagne" value={currentCampaign()} />
        {subscription && <Segment label="Abonnement" value={<span className="capitalize">{subscription.plan_name}</span>} tone="success" />}
        <Segment label="Début" value={fmtDate(subscription?.start_date)} />
        <Segment label="Fin" value={fmtDate(subscription?.end_date)} />
        <Segment label="Jours restants" value={subscription ? `${subscription.days_remaining} j` : "—"} tone={daysTone} />
      </div>
    </div>
  );
}
