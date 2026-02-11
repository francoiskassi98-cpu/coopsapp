import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel } from "@/lib/excel-utils";
import { toast } from "@/hooks/use-toast";
import { FileSpreadsheet, Download } from "lucide-react";

export default function ExportPage() {
  const [exportType, setExportType] = useState("all");
  const [connaissement, setConnaissement] = useState("");
  const [shipments, setShipments] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("shipments").select("id, connaissement").eq("status", "active").order("created_at", { ascending: false }).then(({ data }) => setShipments(data || []));
  }, []);

  const handleExport = async () => {
    try {
      if (exportType === "potential") {
        // Export remaining potential per producer
        const { data: producers } = await supabase.from("producers").select("full_name, section, plantation_code, delivery_potential, remaining_potential, cooperative").order("section");
        if (!producers || producers.length === 0) {
          toast({ title: "Aucune donnée", variant: "destructive" });
          return;
        }
        exportToExcel(
          producers.map((p) => ({
            "Nom complet": p.full_name,
            "Section": p.section,
            "Code plantation": p.plantation_code,
            "Potentiel initial (kg)": p.delivery_potential,
            "Potentiel restant (kg)": p.remaining_potential,
            "Coopérative": p.cooperative,
          })),
          "Potentiel-Restant.xlsx",
          "Potentiel"
        );
        toast({ title: "Export réussi" });
        return;
      }

      // Build delivery query
      let query = supabase
        .from("deliveries")
        .select("*, producers(full_name, section, plantation_code, cooperative), shipments(connaissement, project, destination, campaign, zone, partners(name))")
        .order("receipt_number");

      if (exportType === "byConnaissement" && connaissement) {
        // Find shipment by connaissement
        const { data: shipment } = await supabase.from("shipments").select("id").eq("connaissement", connaissement).eq("status", "active").maybeSingle();
        if (!shipment) {
          toast({ title: "Connaissement introuvable", variant: "destructive" });
          return;
        }
        query = query.eq("shipment_id", shipment.id);
      }

      const { data: deliveries, error } = await query;
      if (error) throw error;
      if (!deliveries || deliveries.length === 0) {
        toast({ title: "Aucune donnée à exporter", variant: "destructive" });
        return;
      }

      // Validate: check all producers exist in registry
      const missingProducers = deliveries.filter((d) => !(d.producers as any)?.full_name);
      if (missingProducers.length > 0) {
        toast({
          title: "Export rejeté",
          description: `${missingProducers.length} producteur(s) non trouvé(s) dans le registre.`,
          variant: "destructive",
        });
        return;
      }

      const rows = deliveries.map((d) => ({
        "Connaissement": (d.shipments as any)?.connaissement || "",
        "Nom complet": (d.producers as any)?.full_name || "",
        "N° Reçu": d.receipt_number,
        "Section": (d.producers as any)?.section || "",
        "Code plantation": (d.producers as any)?.plantation_code || "",
        "Date livraison": d.delivery_date,
        "Poids net (kg)": d.net_weight,
        "Nombre de sacs": d.num_bags,
        "Projet": (d.shipments as any)?.project || "",
        "Partenaire": (d.shipments as any)?.partners?.name || "",
        "Zone": (d.shipments as any)?.zone || "",
        "Destination": (d.shipments as any)?.destination || "",
        "Campagne": (d.shipments as any)?.campaign || "",
      }));

      const filename = exportType === "byConnaissement" ? `Chargement-${connaissement}.xlsx` : "Knf-Modèle-FA.xlsx";
      exportToExcel(rows, filename, "Chargement");
      toast({ title: "Export réussi" });
    } catch (err: any) {
      toast({ title: "Erreur d'export", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileSpreadsheet className="h-6 w-6" /> Export Excel
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Options d'export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Type d'export</Label>
            <Select value={exportType} onValueChange={setExportType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les chargements</SelectItem>
                <SelectItem value="byConnaissement">Par connaissement</SelectItem>
                <SelectItem value="potential">Potentiel restant par producteur</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {exportType === "byConnaissement" && (
            <div className="space-y-2">
              <Label>N° Connaissement</Label>
              <Select value={connaissement} onValueChange={setConnaissement}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un connaissement" /></SelectTrigger>
                <SelectContent>
                  {shipments.filter((s) => s.connaissement).map((s) => (
                    <SelectItem key={s.id} value={s.connaissement}>{s.connaissement}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button onClick={handleExport} className="w-full">
            <Download className="h-4 w-4 mr-2" /> Exporter
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
