import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Map, Upload, History, Inbox, Loader, CheckCircle2, Archive, Clock } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import GeoStatusBadge from "@/components/geospatial/GeoStatusBadge";

export default function GeospatialDashboard() {
  const { isSuperAdmin } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["geo-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.from("geospatial_requests")
        .select("id,title,status,is_archived,created_at,cooperatives(name)")
        .order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = data ?? [];
  const active = rows.filter((r) => !r.is_archived);
  const kpis = [
    { label: "Demandes soumises", value: rows.length, icon: Inbox },
    { label: "En attente", value: active.filter((r) => r.status === "en_attente").length, icon: Clock },
    { label: "En cours de traitement", value: active.filter((r) => r.status === "en_cours" || r.status === "traite").length, icon: Loader },
    { label: "Publiées", value: active.filter((r) => r.status === "publie").length, icon: CheckCircle2 },
    { label: "Archivées", value: rows.filter((r) => r.is_archived).length, icon: Archive },
  ];

  return (
    <div className="space-y-6">
      <PageHeader icon={Map} title="Centre géospatial"
        description={isSuperAdmin ? "Traitez les fichiers polygonaux soumis par les coopératives." : "Soumettez vos fichiers polygonaux et récupérez les résultats traités."}
        actions={<div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/geospatial/historique"><History className="h-4 w-4 mr-2" />Toutes les demandes</Link></Button>
          {!isSuperAdmin && <Button asChild><Link to="/geospatial/soumettre"><Upload className="h-4 w-4 mr-2" />Nouvelle soumission</Link></Button>}
        </div>} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}><CardContent className="p-4">
            <k.icon className="h-5 w-5 text-primary mb-2" />
            {isLoading ? <Skeleton className="h-7 w-12" /> : <div className="text-2xl font-bold">{k.value}</div>}
            <div className="text-xs text-muted-foreground">{k.label}</div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Dernières demandes</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          {!isLoading && active.length === 0 && <p className="text-sm text-muted-foreground">Aucune demande pour le moment.</p>}
          {active.slice(0, 8).map((r) => (
            <Link key={r.id} to={`/geospatial/${r.id}`} className="flex items-center justify-between gap-3 rounded-lg p-3 hover:bg-muted/50 transition-colors">
              <div className="min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  {isSuperAdmin && r.status === "en_attente" && <span className="h-2 w-2 rounded-full bg-secondary shrink-0" aria-label="Nouvelle" />}
                  {r.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {(r.cooperatives as { name: string } | null)?.name} · {new Date(r.created_at).toLocaleString("fr-FR")}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0"><GeoStatusBadge status={r.status} /><span className="text-xs text-primary hidden sm:inline">Voir les détails →</span></div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
