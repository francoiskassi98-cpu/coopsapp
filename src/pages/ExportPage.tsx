import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel } from "@/lib/excel-utils";
import { fetchAllRows } from "@/lib/database-utils";
import { toast } from "@/hooks/use-toast";
import { FileSpreadsheet, Download, Users, Ship, MapPin, Loader2 } from "lucide-react";

export default function ExportPage() {
  const [shipments, setShipments] = useState<any[]>([]);
  const [cooperatives, setCooperatives] = useState<{ id: string; name: string }[]>([]);
  const [selectedCoop, setSelectedCoop] = useState("");
  const [selectedConnaissement, setSelectedConnaissement] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("shipments").select("id, connaissement, zone, cooperative_id").eq("is_cancelled", false).order("created_at", { ascending: false }).then(({ data }) => setShipments(data || []));
    supabase.from("cooperatives").select("id, name").order("name").then(({ data }) => setCooperatives(data || []));
  }, []);

  const exportByCooperative = async () => {
    if (!selectedCoop) { toast({ title: "Sélectionnez une coopérative", variant: "destructive" }); return; }
    setLoading("coop");
    try {
      // Get deliveries for shipments matching this cooperative_id
      const { data: coopShipments } = await supabase.from("shipments").select("id, connaissement, project, destination, campaign, zone, total_weight, total_bags, partner_id, partners(name), cooperatives(name)").eq("cooperative_id", selectedCoop).eq("is_cancelled", false);
      if (!coopShipments || coopShipments.length === 0) { toast({ title: "Aucun chargement pour cette coopérative", variant: "destructive" }); setLoading(null); return; }

      const shipmentIds = coopShipments.map((s) => s.id);
      const { data: deliveries } = await supabase.from("deliveries").select("*, producers(full_name, section, plantation_code, cooperative)").in("shipment_id", shipmentIds).order("receipt_number");

      const shipmentMap = Object.fromEntries(coopShipments.map((s) => [s.id, s]));
      const rows = (deliveries || []).map((d) => {
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
      await exportToExcel(rows, `Chargements-${coopName}.xlsx`, "Chargement");
      toast({ title: "Export réussi" });
    } catch (err: any) { toast({ title: "Erreur", description: err.message, variant: "destructive" }); }
    setLoading(null);
  };

  const exportAllOrByConnaissement = async (mode: "all" | "connaissement") => {
    setLoading(mode);
    try {
      let query = supabase.from("deliveries").select("*, producers(full_name, section, plantation_code, cooperative), shipments(connaissement, project, destination, campaign, zone, cooperative_id, cooperatives(name), partners(name))").order("receipt_number");

      if (mode === "connaissement") {
        if (!selectedConnaissement) { toast({ title: "Sélectionnez un connaissement", variant: "destructive" }); setLoading(null); return; }
        const { data: shipment } = await supabase.from("shipments").select("id").eq("connaissement", selectedConnaissement).eq("is_cancelled", false).maybeSingle();
        if (!shipment) { toast({ title: "Connaissement introuvable", variant: "destructive" }); setLoading(null); return; }
        query = query.eq("shipment_id", shipment.id);
      }

      const { data: deliveries, error } = await query;
      if (error) throw error;
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

      const filename = mode === "connaissement" ? `Chargement-${selectedConnaissement}.xlsx` : "Knf-Modèle-FA.xlsx";
      await exportToExcel(rows, filename, "Chargement");
      toast({ title: "Export réussi" });
    } catch (err: any) { toast({ title: "Erreur", description: err.message, variant: "destructive" }); }
    setLoading(null);
  };

  const exportPotentialByZone = async () => {
    setLoading("potential");
    try {
      const { data: producers } = await supabase.from("producers").select("full_name, section, plantation_code, delivery_potential, remaining_potential, cooperative").order("cooperative").order("section");
      if (!producers || producers.length === 0) { toast({ title: "Aucune donnée", variant: "destructive" }); setLoading(null); return; }

      const rows = producers.map((p) => ({
        "Coopérative / Zone": p.cooperative,
        "Nom complet": p.full_name,
        "Section": p.section,
        "Code plantation": p.plantation_code,
        "Potentiel initial (kg)": p.delivery_potential,
        "Potentiel restant (kg)": p.remaining_potential,
      }));

      await exportToExcel(rows, "Potentiel-Restant-Par-Zone.xlsx", "Potentiel");
      toast({ title: "Export réussi" });
    } catch (err: any) { toast({ title: "Erreur", description: err.message, variant: "destructive" }); }
    setLoading(null);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileSpreadsheet className="h-6 w-6 text-primary" /> Export Excel
      </h1>

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
            <CardDescription>Tous les chargements ou filtrer par connaissement</CardDescription>
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
              Export complet du potentiel initial et restant, regroupé par coopérative / zone.
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
