import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle, RefreshCw, Mail } from "lucide-react";
import { isCampaignStart, getCurrentCampaign, normalizeCampaign } from "@/lib/shipment-utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import KpiCards from "@/components/dashboard/KpiCards";
import CoopPerformance from "@/components/dashboard/CoopPerformance";
import CoopTable from "@/components/dashboard/CoopTable";
import DashboardFilters from "@/components/dashboard/DashboardFilters";
import ReportDialog from "@/components/dashboard/ReportDialog";
import type { CoopStats } from "@/components/dashboard/CoopPerformance";

const PIE_COLORS = ["hsl(25, 65%, 32%)", "hsl(140, 35%, 40%)", "hsl(35, 70%, 55%)", "hsl(200, 50%, 50%)", "hsl(280, 40%, 50%)", "hsl(0, 50%, 50%)", "hsl(60, 50%, 45%)"];

export default function Dashboard() {
  const [allShipments, setAllShipments] = useState<any[]>([]);
  const [allProducers, setAllProducers] = useState<any[]>([]);
  const [showCampaignAlert, setShowCampaignAlert] = useState(false);
  const [loading, setLoading] = useState(false);
  const [coopDetailName, setCoopDetailName] = useState<string | null>(null);

  // Chronology filters
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);

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
      const [producers, shipmentsData] = await Promise.all([
        fetchAllRows(supabase.from("producers").select("delivery_potential, remaining_potential, cooperative")),
        fetchAllRows(supabase.from("shipments").select("*, partners(name), cooperatives(name)").order("created_at", { ascending: false })),
      ]);
      setAllProducers(producers);
      setAllShipments(shipmentsData);
    } catch (e) {
      console.error("Erreur chargement données:", e);
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  }

  // Available campaigns
  const campaigns = useMemo(() => {
    const set = new Set<string>();
    allShipments.forEach((s) => { if (s.campaign) set.add(normalizeCampaign(s.campaign)); });
    return Array.from(set).sort();
  }, [allShipments]);

  // Filtered shipments based on chronology
  const shipments = useMemo(() => {
    return allShipments.filter((s) => {
      if (selectedCampaign !== "all" && normalizeCampaign(s.campaign) !== selectedCampaign) return false;
      if (selectedMonths.length > 0) {
        const date = new Date(s.created_at);
        const month = date.getMonth() + 1;
        if (!selectedMonths.includes(month)) return false;
      }
      return true;
    });
  }, [allShipments, selectedCampaign, selectedMonths]);

  // Computed stats
  const stats = useMemo(() => {
    const totalPotential = allProducers.reduce((s, p) => s + Number(p.delivery_potential), 0);
    const remaining = allProducers.reduce((s, p) => s + Number(p.remaining_potential), 0);
    const totalDelivered = shipments.reduce((s, sh) => s + Number(sh.total_weight), 0);
    return { totalPotential, totalDelivered, remaining, shipmentCount: shipments.length };
  }, [allProducers, shipments]);

  const byProject = useMemo(() => {
    const map: Record<string, number> = {};
    shipments.forEach((s) => { map[s.project] = (map[s.project] || 0) + Number(s.total_weight); });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [shipments]);

  const byPartner = useMemo(() => {
    const map: Record<string, number> = {};
    shipments.forEach((s) => {
      const pName = (s.partners as any)?.name || "Inconnu";
      map[pName] = (map[pName] || 0) + Number(s.total_weight);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [shipments]);

  const coopStats = useMemo(() => {
    const coopPotentialMap: Record<string, { potentiel: number; remaining: number }> = {};
    allProducers.forEach((p) => {
      const coop = p.cooperative || "Inconnu";
      if (!coopPotentialMap[coop]) coopPotentialMap[coop] = { potentiel: 0, remaining: 0 };
      coopPotentialMap[coop].potentiel += Number(p.delivery_potential);
      coopPotentialMap[coop].remaining += Number(p.remaining_potential);
    });

    const coopDeliveredMap: Record<string, { delivered: number; count: number }> = {};
    shipments.forEach((s) => {
      const coop = (s.cooperatives as any)?.name || s.zone || "Inconnu";
      if (!coopDeliveredMap[coop]) coopDeliveredMap[coop] = { delivered: 0, count: 0 };
      coopDeliveredMap[coop].delivered += Number(s.total_weight);
      coopDeliveredMap[coop].count += 1;
    });

    const allCoops = new Set([...Object.keys(coopPotentialMap), ...Object.keys(coopDeliveredMap)]);
    return Array.from(allCoops).map((name) => ({
      name,
      potentiel: coopPotentialMap[name]?.potentiel || 0,
      delivered: coopDeliveredMap[name]?.delivered || 0,
      remaining: coopPotentialMap[name]?.remaining || 0,
      shipmentCount: coopDeliveredMap[name]?.count || 0,
    })).sort((a, b) => b.delivered - a.delivered);
  }, [allProducers, shipments]);

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
        <div className="flex gap-2">
          <Button onClick={() => toast.success("Mail bien envoyé avec le rapport")} variant="outline">
            <Mail className="h-4 w-4" />
            Rapport par mail
          </Button>
          <Button onClick={() => { loadData().then(() => toast.success("Données actualisées")); }} disabled={loading} variant="outline">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </div>
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

      {/* Chronology Filters */}
      <DashboardFilters
        campaigns={campaigns}
        selectedCampaign={selectedCampaign}
        onCampaignChange={setSelectedCampaign}
        selectedMonths={selectedMonths}
        onMonthsChange={setSelectedMonths}
      />

      <KpiCards
        totalPotential={stats.totalPotential}
        totalDelivered={stats.totalDelivered}
        remaining={stats.remaining}
        shipmentCount={stats.shipmentCount}
      />

      <CoopPerformance coopStats={coopStats} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Répartition par projet</CardTitle></CardHeader>
          <CardContent className="h-64">
            {byProject.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byProject} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value.toLocaleString("fr-FR")} kg`}>
                    {byProject.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v.toLocaleString("fr-FR")} kg`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (<p className="text-sm text-muted-foreground flex items-center justify-center h-full">Aucune donnée</p>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Répartition par partenaire</CardTitle></CardHeader>
          <CardContent className="h-64">
            {byPartner.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byPartner} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value.toLocaleString("fr-FR")} kg`}>
                    {byPartner.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v.toLocaleString("fr-FR")} kg`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (<p className="text-sm text-muted-foreground flex items-center justify-center h-full">Aucune donnée</p>)}
          </CardContent>
        </Card>
      </div>

      <CoopTable coopStats={coopStats} totalDelivered={stats.totalDelivered} totalRemaining={stats.remaining} onViewDetail={setCoopDetailName} />

      <Dialog open={!!coopDetailName} onOpenChange={() => setCoopDetailName(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader><DialogTitle>Chargements — {coopDetailName}</DialogTitle></DialogHeader>
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
