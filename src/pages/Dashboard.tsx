import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Package, TrendingUp, Leaf, AlertTriangle, RefreshCw, Eye } from "lucide-react";
import { isCampaignStart, getCurrentCampaign } from "@/lib/shipment-utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PIE_COLORS = ["hsl(25, 65%, 32%)", "hsl(140, 35%, 40%)", "hsl(35, 70%, 55%)", "hsl(200, 50%, 50%)", "hsl(280, 40%, 50%)", "hsl(0, 50%, 50%)", "hsl(60, 50%, 45%)"];

type CoopStats = {
  name: string;
  potentiel: number;
  delivered: number;
  remaining: number;
  shipmentCount: number;
};

export default function Dashboard() {
  const [stats, setStats] = useState({ totalPotential: 0, totalDelivered: 0, remaining: 0 });
  const [byProject, setByProject] = useState<{ name: string; value: number }[]>([]);
  const [byPartner, setByPartner] = useState<{ name: string; value: number }[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  
  const [showCampaignAlert, setShowCampaignAlert] = useState(false);
  const [loading, setLoading] = useState(false);
  const [coopStats, setCoopStats] = useState<CoopStats[]>([]);
  const [coopDetailName, setCoopDetailName] = useState<string | null>(null);

  useEffect(() => {
    setShowCampaignAlert(isCampaignStart());
    loadData();
  }, []);

  async function fetchAllRows(query: any) {
    let allData: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error || !data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return allData;
  }

  async function loadData() {
    setLoading(true);
    try {
      const producers = await fetchAllRows(
        supabase.from("producers").select("delivery_potential, remaining_potential, cooperative")
      );
      const totalPotential = producers.reduce((s: number, p: any) => s + Number(p.delivery_potential), 0);
      const remaining = producers.reduce((s: number, p: any) => s + Number(p.remaining_potential), 0);

      const shipmentsData = await fetchAllRows(
        supabase.from("shipments").select("*, partners(name), cooperatives(name)").eq("status", "active").order("created_at", { ascending: false })
      );

      const totalDelivered = shipmentsData.reduce((s: number, sh: any) => s + Number(sh.total_weight), 0);
      setStats({ totalPotential, totalDelivered, remaining });

      setShipments(shipmentsData);

      // By project
      const projectMap: Record<string, number> = {};
      shipmentsData.forEach((s: any) => {
        projectMap[s.project] = (projectMap[s.project] || 0) + Number(s.total_weight);
      });
      setByProject(Object.entries(projectMap).map(([name, value]) => ({ name, value })));

      // By partner
      const partnerMap: Record<string, number> = {};
      shipmentsData.forEach((s: any) => {
        const pName = (s.partners as any)?.name || "Inconnu";
        partnerMap[pName] = (partnerMap[pName] || 0) + Number(s.total_weight);
      });
      setByPartner(Object.entries(partnerMap).map(([name, value]) => ({ name, value })));

      // Cooperative stats: potential from producers, delivered from shipments via cooperative_id
      const coopPotentialMap: Record<string, { potentiel: number; remaining: number }> = {};
      producers.forEach((p: any) => {
        const coop = p.cooperative || "Inconnu";
        if (!coopPotentialMap[coop]) coopPotentialMap[coop] = { potentiel: 0, remaining: 0 };
        coopPotentialMap[coop].potentiel += Number(p.delivery_potential);
        coopPotentialMap[coop].remaining += Number(p.remaining_potential);
      });

      const coopDeliveredMap: Record<string, { delivered: number; count: number }> = {};
      shipmentsData.forEach((s: any) => {
        const coop = (s.cooperatives as any)?.name || s.zone || "Inconnu";
        if (!coopDeliveredMap[coop]) coopDeliveredMap[coop] = { delivered: 0, count: 0 };
        coopDeliveredMap[coop].delivered += Number(s.total_weight);
        coopDeliveredMap[coop].count += 1;
      });

      const allCoops = new Set([...Object.keys(coopPotentialMap), ...Object.keys(coopDeliveredMap)]);
      const coopStatsArr: CoopStats[] = Array.from(allCoops).map((name) => ({
        name,
        potentiel: coopPotentialMap[name]?.potentiel || 0,
        delivered: coopDeliveredMap[name]?.delivered || 0,
        remaining: coopPotentialMap[name]?.remaining || 0,
        shipmentCount: coopDeliveredMap[name]?.count || 0,
      })).sort((a, b) => b.delivered - a.delivered);

      setCoopStats(coopStatsArr);
    } catch (e) {
      console.error("Erreur chargement données:", e);
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  }


  const coopDetailShipments = coopDetailName
    ? shipments.filter((s) => ((s.cooperatives as any)?.name || s.zone || "Inconnu") === coopDetailName)
    : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground">Campagne {getCurrentCampaign()}</p>
        </div>
        <Button onClick={() => { loadData().then(() => toast.success("Données actualisées")); }} disabled={loading} variant="outline">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {showCampaignAlert && (
        <Card className="border-warning bg-warning/10">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <p className="text-sm font-medium">
              Nouvelle campagne détectée ! Pensez à mettre à jour les potentiels de livraison des producteurs.
            </p>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Potentiel total estimé</CardTitle>
            <Leaf className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPotential.toLocaleString("fr-FR")} kg</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Poids total livré</CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDelivered.toLocaleString("fr-FR")} kg</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Potentiel restant</CardTitle>
            <TrendingUp className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.remaining.toLocaleString("fr-FR")} kg</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Répartition par projet</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {byProject.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byProject} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value.toLocaleString("fr-FR")} kg`}>
                    {byProject.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v.toLocaleString("fr-FR")} kg`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center justify-center h-full">Aucune donnée</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Répartition par partenaire</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {byPartner.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byPartner}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: number) => `${v.toLocaleString("fr-FR")} kg`} />
                  <Bar dataKey="value" fill="hsl(25, 65%, 32%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center justify-center h-full">Aucune donnée</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Potentiel par coopérative */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Potentiel par coopérative</CardTitle>
        </CardHeader>
        <CardContent>
          {coopStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée</p>
          ) : (
            <div className="max-h-[50vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coopérative</TableHead>
                    <TableHead>Potentiel estimé (kg)</TableHead>
                    <TableHead>Poids livré (kg)</TableHead>
                    <TableHead>% Livraison</TableHead>
                    <TableHead>Potentiel restant (kg)</TableHead>
                    <TableHead>Nb chargements</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coopStats.map((c) => {
                    const pct = c.potentiel > 0 ? (c.delivered / c.potentiel) * 100 : 0;
                    return (
                    <TableRow key={c.name}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.potentiel.toLocaleString("fr-FR")}</TableCell>
                      <TableCell>{c.delivered.toLocaleString("fr-FR")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="text-xs font-medium">{pct.toFixed(1)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{c.remaining.toLocaleString("fr-FR")}</TableCell>
                      <TableCell>{c.shipmentCount}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setCoopDetailName(c.name)} disabled={c.shipmentCount === 0}>
                          <Eye className="h-4 w-4 mr-1" /> Détails
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cooperative Detail Modal */}
      <Dialog open={!!coopDetailName} onOpenChange={() => setCoopDetailName(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Chargements — {coopDetailName}</DialogTitle>
          </DialogHeader>
          {coopDetailShipments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun chargement</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Connaissement</TableHead>
                  <TableHead>Projet</TableHead>
                  <TableHead>Partenaire</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Poids (kg)</TableHead>
                  <TableHead>Sacs</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coopDetailShipments.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.connaissement || "—"}</TableCell>
                    <TableCell>{s.project}</TableCell>
                    <TableCell>{(s.partners as any)?.name || "—"}</TableCell>
                    <TableCell>{s.destination}</TableCell>
                    <TableCell>{Number(s.total_weight).toLocaleString("fr-FR")}</TableCell>
                    <TableCell>{s.total_bags}</TableCell>
                    <TableCell>{new Date(s.created_at).toLocaleDateString("fr-FR")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
