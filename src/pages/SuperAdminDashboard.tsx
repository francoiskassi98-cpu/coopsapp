import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Building2, CheckCircle2, Clock, AlertCircle, Ban, Users, Layers, Sprout } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";

interface Stats {
  total_coops: number;
  active_coops: number;
  trial_coops: number;
  expired_coops: number;
  suspended_coops: number;
  total_registres: number;
  total_users: number;
  total_producers: number;
}

function Kpi({ label, value, icon: Icon, tone = "primary" }: { label: string; value: number; icon: any; tone?: string }) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-600",
    warning: "bg-amber-500/10 text-amber-600",
    danger:  "bg-rose-500/10 text-rose-600",
    muted:   "bg-slate-500/10 text-slate-500",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">{label}</div>
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tones[tone] ?? tones.primary}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-bold tracking-tight">{Number(value).toLocaleString("fr-FR")}</div>
      </CardContent>
    </Card>
  );
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any).rpc("get_super_admin_stats");
      if (!error && data?.[0]) setStats(data[0] as Stats);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord Super Administrateur</h1>
          <p className="text-sm text-muted-foreground">Vision globale de toutes les coopératives de la plateforme.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/gestion/cooperatives">Gérer les coopératives</Link></Button>
          <Button asChild><Link to="/gestion/cooperatives/nouvelle">+ Nouvelle coopérative</Link></Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !stats ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Statistiques indisponibles.</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <Kpi label="Coopératives" value={stats.total_coops} icon={Building2} tone="primary" />
            <Kpi label="Actives" value={stats.active_coops} icon={CheckCircle2} tone="success" />
            <Kpi label="Essai" value={stats.trial_coops} icon={Clock} tone="warning" />
            <Kpi label="Expirées" value={stats.expired_coops} icon={AlertCircle} tone="danger" />
            <Kpi label="Suspendues" value={stats.suspended_coops} icon={Ban} tone="muted" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Kpi label="Registres" value={stats.total_registres} icon={Layers} tone="primary" />
            <Kpi label="Utilisateurs" value={stats.total_users} icon={Users} tone="primary" />
            <Kpi label="Producteurs" value={stats.total_producers} icon={Sprout} tone="success" />
          </div>
        </>
      )}
    </div>
  );
}
