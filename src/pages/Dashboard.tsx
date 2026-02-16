import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Package, TrendingUp, Leaf, AlertTriangle } from "lucide-react";
import { isCampaignStart, getCurrentCampaign } from "@/lib/shipment-utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const PIE_COLORS = ["hsl(25, 65%, 32%)", "hsl(140, 35%, 40%)", "hsl(35, 70%, 55%)", "hsl(200, 50%, 50%)"];

export default function Dashboard() {
  const [stats, setStats] = useState({ totalPotential: 0, totalDelivered: 0, remaining: 0 });
  const [byProject, setByProject] = useState<{ name: string; value: number }[]>([]);
  const [byPartner, setByPartner] = useState<{ name: string; value: number }[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showCampaignAlert, setShowCampaignAlert] = useState(false);

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
    // Get all producer stats (no limit)
    const producers = await fetchAllRows(
      supabase.from("producers").select("delivery_potential, remaining_potential")
    );
    if (producers.length > 0) {
      const totalPotential = producers.reduce((s: number, p: any) => s + Number(p.delivery_potential), 0);
      const remaining = producers.reduce((s: number, p: any) => s + Number(p.remaining_potential), 0);
      setStats({ totalPotential, totalDelivered: totalPotential - remaining, remaining });
    }

    // Get all shipments with partner info (no limit)
    const shipmentsData = await fetchAllRows(
      supabase.from("shipments").select("*, partners(name)").eq("status", "active").order("created_at", { ascending: false })
    );

    if (shipmentsData.length > 0) {
      setShipments(shipmentsData);

      // By project
      const projectMap: Record<string, number> = {};
      shipmentsData.forEach((s) => {
        projectMap[s.project] = (projectMap[s.project] || 0) + Number(s.total_weight);
      });
      setByProject(Object.entries(projectMap).map(([name, value]) => ({ name, value })));

      // By partner
      const partnerMap: Record<string, number> = {};
      shipmentsData.forEach((s) => {
        const pName = (s.partners as any)?.name || "Inconnu";
        partnerMap[pName] = (partnerMap[pName] || 0) + Number(s.total_weight);
      });
      setByPartner(Object.entries(partnerMap).map(([name, value]) => ({ name, value })));
    }
  }

  const filtered = shipments.filter(
    (s) =>
      !search ||
      s.connaissement?.toLowerCase().includes(search.toLowerCase()) ||
      (s.partners as any)?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground">Campagne {getCurrentCampaign()}</p>
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

      {/* Shipment History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Historique des chargements</CardTitle>
            <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Connaissement</TableHead>
                <TableHead>Projet</TableHead>
                <TableHead>Partenaire</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Poids (kg)</TableHead>
                <TableHead>Sacs</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">Aucun chargement</TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.connaissement || "—"}</TableCell>
                    <TableCell>{s.project}</TableCell>
                    <TableCell>{(s.partners as any)?.name || "—"}</TableCell>
                    <TableCell>{s.destination}</TableCell>
                    <TableCell>{Number(s.total_weight).toLocaleString("fr-FR")}</TableCell>
                    <TableCell>{s.total_bags}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "active" ? "default" : "destructive"}>
                        {s.status === "active" ? "Actif" : "Annulé"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
