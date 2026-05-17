import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel } from "@/lib/excel-utils";
import { fetchAllRows } from "@/lib/database-utils";
import { useCampaigns, useActiveCampaign } from "@/hooks/useActiveCampaign";
import { toast } from "@/hooks/use-toast";
import { FileSpreadsheet, Download, Users, Ship, MapPin, Loader2, Calendar } from "lucide-react";

const ALL_CAMPAIGNS = "__all__";

export default function ExportPage() {
  const [shipments, setShipments] = useState<any[]>([]);
  const [cooperatives, setCooperatives] = useState<{ id: string; name: string }[]>([]);
  const [selectedCoop, setSelectedCoop] = useState("");
  const [selectedConnaissement, setSelectedConnaissement] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [loading, setLoading] = useState<string | null>(null);
  const { campaigns } = useCampaigns();
  const { campaign: activeCampaign } = useActiveCampaign();

  // Default to active campaign when available
  useEffect(() => {
    if (!selectedCampaign && activeCampaign) {
      setSelectedCampaign(activeCampaign.id);
    }
  }, [activeCampaign, selectedCampaign]);

  // Reload shipments when campaign filter changes
  useEffect(() => {
    let q = supabase
      .from("shipments")
      .select("id, connaissement, zone, cooperative_id, campaign_id")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (selectedCampaign && selectedCampaign !== ALL_CAMPAIGNS) {
      q = q.eq("campaign_id", selectedCampaign);
    }
    q.then(({ data }) => setShipments(data || []));
    supabase.from("cooperatives").select("id, name").order("name").then(({ data }) => setCooperatives(data || []));
  }, [selectedCampaign]);

  const campaignLabel = () => {
    if (!selectedCampaign || selectedCampaign === ALL_CAMPAIGNS) return "Toutes-Campagnes";
    return campaigns.find((c) => c.id === selectedCampaign)?.nom || "Campagne";
  };

  const applyCampaignFilter = (q: any, column = "campaign_id") => {
    if (selectedCampaign && selectedCampaign !== ALL_CAMPAIGNS) {
      return q.eq(column, selectedCampaign);
    }
    return q;
  };

  const exportByCooperative = async () => {
    if (!selectedCoop) { toast({ title: "Sélectionnez une coopérative", variant: "destructive" }); return; }
    setLoading("coop");
    try {
      const coopShipments = await fetchAllRows(
        "shipments",
        "id, connaissement, project, destination, campaign, zone, total_weight, total_bags, partner_id, campaign_id, partners(name), cooperatives(name)",
        {
          filters: (q) => applyCampaignFilter(q.eq("cooperative_id", selectedCoop).eq("status", "active")),
          order: { column: "created_at", ascending: false },
          pageSize: 500
        }
      );

      if (!coopShipments || coopShipments.length === 0) {
        toast({ title: "Aucun chargement pour cette coopérative dans cette campagne", variant: "destructive" });
        setLoading(null);
        return;
      }

      const shipmentIds = coopShipments.map((s) => s.id);
      const deliveries: any[] = [];
      const chunkSize = 100;

      for (let i = 0; i < shipmentIds.length; i += chunkSize) {
        const chunk = shipmentIds.slice(i, i + chunkSize);
        const chunkDeliveries = await fetchAllRows(
          "deliveries",
          "*, producers(full_name, section, plantation_code, cooperative)",
          {
            filters: (q) => q.in("shipment_id", chunk),
            order: { column: "receipt_number", ascending: true },
            pageSize: 500
          }
        );
        deliveries.push(...chunkDeliveries);
      }

      const shipmentMap = Object.fromEntries(coopShipments.map((s) => [s.id, s]));
      const rows = deliveries.map((d) => {
        const s = shipmentMap[d.shipment_id] || {};
        return {
          "N°": "",
          "Connaissement": (s as any)?.connaissement || "",
          "N° Reçu": d.receipt_number,
          "Nom complet": (d.producers as any)?.full_name || "",
          "Code plantation": (d.producers as any)?.plantation_code || "",
          "Section": (d.producers as any)?.section || "",
          "Poids net (kg)": d.net_weight,
          "Nombre de sacs": d.num_bags,
          "Date livraison": d.delivery_date,
          "Projet": (s as any)?.project || "",
          "Partenaire": (s as any)?.partners?.name || "",
          "Zone": (s as any)?.cooperatives?.name || (s as any)?.zone || "",
          "Destination": (s as any)?.destination || "",
          "Campagne": (s as any)?.campaign || "",
        };
      });

      if (rows.length === 0) { toast({ title: "Aucune livraison trouvée", variant: "destructive" }); setLoading(null); return; }
      const coopName = cooperatives.find(c => c.id === selectedCoop)?.name || selectedCoop;
      await exportToExcel(rows, `Chargements-${coopName}-${campaignLabel()}.xlsx`, "Chargement");
      toast({ title: "Export réussi" });
    } catch (err: any) { (console.error(err), toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" })); }
    setLoading(null);
  };

  const exportAllOrByConnaissement = async (mode: "all" | "connaissement") => {
    setLoading(mode);
    try {
      let shipmentIdFilter: string[] | undefined;

      if (mode === "connaissement") {
        if (!selectedConnaissement) { toast({ title: "Sélectionnez un connaissement", variant: "destructive" }); setLoading(null); return; }
        const { data: shipment } = await supabase.from("shipments").select("id").eq("connaissement", selectedConnaissement).eq("status", "active").maybeSingle();
        if (!shipment) { toast({ title: "Connaissement introuvable", variant: "destructive" }); setLoading(null); return; }
        shipmentIdFilter = [shipment.id];
      } else if (selectedCampaign && selectedCampaign !== ALL_CAMPAIGNS) {
        // Restrict to shipments of the selected campaign
        const campaignShipments = await fetchAllRows("shipments", "id", {
          filters: (q) => q.eq("campaign_id", selectedCampaign).eq("status", "active"),
          pageSize: 500,
        });
        shipmentIdFilter = campaignShipments.map((s: any) => s.id);
        if (shipmentIdFilter.length === 0) {
          toast({ title: "Aucun chargement pour cette campagne", variant: "destructive" });
          setLoading(null);
          return;
        }
      }

      const deliveries: any[] = [];
      if (shipmentIdFilter && shipmentIdFilter.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < shipmentIdFilter.length; i += chunkSize) {
          const chunk = shipmentIdFilter.slice(i, i + chunkSize);
          const chunkDeliveries = await fetchAllRows(
            "deliveries",
            "*, producers(full_name, section, plantation_code, cooperative), shipments!inner(connaissement, project, destination, campaign, zone, cooperative_id, cooperatives(name), partners(name))",
            {
              filters: (q) => q.in("shipment_id", chunk),
              order: { column: "receipt_number", ascending: true },
              pageSize: 500
            }
          );
          deliveries.push(...chunkDeliveries);
        }
      } else {
        // mode "all" + toutes campagnes
        const all = await fetchAllRows(
          "deliveries",
          "*, producers(full_name, section, plantation_code, cooperative), shipments!inner(connaissement, project, destination, campaign, zone, cooperative_id, cooperatives(name), partners(name))",
          {
            order: { column: "receipt_number", ascending: true },
            pageSize: 500,
          }
        );
        deliveries.push(...all);
      }

      if (!deliveries || deliveries.length === 0) { toast({ title: "Aucune donnée à exporter", variant: "destructive" }); setLoading(null); return; }

      const rows = deliveries.map((d) => ({
        "N°": "",
        "Connaissement": (d.shipments as any)?.connaissement || "",
        "N° Reçu": d.receipt_number,
        "Nom complet": (d.producers as any)?.full_name || "",
        "Code plantation": (d.producers as any)?.plantation_code || "",
        "Section": (d.producers as any)?.section || "",
        "Poids net (kg)": d.net_weight,
        "Nombre de sacs": d.num_bags,
        "Date livraison": d.delivery_date,
        "Projet": (d.shipments as any)?.project || "",
        "Partenaire": (d.shipments as any)?.partners?.name || "",
        "Zone": (d.shipments as any)?.cooperatives?.name || (d.shipments as any)?.zone || "",
        "Destination": (d.shipments as any)?.destination || "",
        "Campagne": (d.shipments as any)?.campaign || "",
      }));

      const filename = mode === "connaissement"
        ? `Chargement-${selectedConnaissement}.xlsx`
        : `Knf-Modèle-FA-${campaignLabel()}.xlsx`;
      await exportToExcel(rows, filename, "Chargement");
      toast({ title: "Export réussi" });
    } catch (err: any) { (console.error(err), toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" })); }
    setLoading(null);
  };

  const exportPotentialByZone = async () => {
    setLoading("potential");
    try {
      // Si une campagne est sélectionnée -> producer_registry de cette campagne
      // Sinon -> table producers (vue globale historique)
      let rows: any[] = [];
      if (selectedCampaign && selectedCampaign !== ALL_CAMPAIGNS) {
        const registry = await fetchAllRows(
          "producer_registry",
          "nom_complet, section, code_plantation, potentiel_livraison, potentiel_restant, cooperative",
          {
            filters: (q) => q.eq("campaign_id", selectedCampaign),
            order: { column: "cooperative", ascending: true },
            pageSize: 500,
          }
        );
        rows = registry.map((p: any) => ({
          "Coopérative / Zone": p.cooperative,
          "Nom complet": p.nom_complet,
          "Section": p.section,
          "Code plantation": p.code_plantation,
          "Potentiel initial (kg)": p.potentiel_livraison,
          "Potentiel restant (kg)": p.potentiel_restant,
        }));
      } else {
        const producers = await fetchAllRows(
          "producers",
          "full_name, section, plantation_code, delivery_potential, remaining_potential, cooperative",
          {
            order: { column: "cooperative", ascending: true },
            pageSize: 500,
          }
        );
        rows = producers.map((p: any) => ({
          "Coopérative / Zone": p.cooperative,
          "Nom complet": p.full_name,
          "Section": p.section,
          "Code plantation": p.plantation_code,
          "Potentiel initial (kg)": p.delivery_potential,
          "Potentiel restant (kg)": p.remaining_potential,
        }));
      }

      if (!rows.length) { toast({ title: "Aucune donnée", variant: "destructive" }); setLoading(null); return; }

      await exportToExcel(rows, `Potentiel-Restant-${campaignLabel()}.xlsx`, "Potentiel");
      toast({ title: "Export réussi" });
    } catch (err: any) { (console.error(err), toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" })); }
    setLoading(null);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-primary" /> Export Excel
        </h1>
      </div>

      {/* Sélecteur global de campagne */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base">Campagne à exporter</CardTitle>
              <CardDescription>
                Tous les exports ci-dessous seront filtrés sur cette campagne. Sélectionnez « Toutes les campagnes » pour exporter l'historique complet.
              </CardDescription>
            </div>
            {activeCampaign && (
              <Badge variant="secondary" className="shrink-0">
                Active : {activeCampaign.nom}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger className="max-w-md"><SelectValue placeholder="Sélectionner une campagne" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CAMPAIGNS}>Toutes les campagnes (historique global)</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nom}{c.utilise_pour_chargement ? " (active)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Export par coopérative */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">Par coopérative</CardTitle>
            </div>
            <CardDescription>Exporter tous les chargements d'une coopérative</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 flex-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Coopérative</Label>
              <Select value={selectedCoop} onValueChange={setSelectedCoop}>
                <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                <SelectContent>
                  {cooperatives.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={exportByCooperative} disabled={loading === "coop"} className="mt-auto w-full">
              {loading === "coop" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Exporter
            </Button>
          </CardContent>
        </Card>

        {/* Export tous / par connaissement */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 rounded-lg bg-primary/10">
                <Ship className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">Chargements</CardTitle>
            </div>
            <CardDescription>Tous les chargements de la campagne ou filtrer par connaissement</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 flex-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Connaissement (optionnel)</Label>
              <Select value={selectedConnaissement} onValueChange={setSelectedConnaissement}>
                <SelectTrigger><SelectValue placeholder="Tous les chargements" /></SelectTrigger>
                <SelectContent>
                  {shipments.filter((s) => s.connaissement).map((s) => (
                    <SelectItem key={s.id} value={s.connaissement}>{s.connaissement}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 mt-auto">
              <Button onClick={() => exportAllOrByConnaissement("all")} disabled={!!loading} variant="outline" className="flex-1">
                {loading === "all" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                Tout
              </Button>
              <Button onClick={() => exportAllOrByConnaissement("connaissement")} disabled={!!loading || !selectedConnaissement} className="flex-1">
                {loading === "connaissement" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                Par n°
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Potentiel restant par zone */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 rounded-lg bg-primary/10">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">Potentiel par zone</CardTitle>
            </div>
            <CardDescription>Potentiel restant de chaque producteur par coopérative</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 flex-1">
            <p className="text-xs text-muted-foreground flex-1">
              {selectedCampaign && selectedCampaign !== ALL_CAMPAIGNS
                ? "Export du potentiel initial et restant pour la campagne sélectionnée."
                : "Export du potentiel global (toutes campagnes confondues)."}
            </p>
            <Button onClick={exportPotentialByZone} disabled={loading === "potential"} className="w-full mt-auto">
              {loading === "potential" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Exporter
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
