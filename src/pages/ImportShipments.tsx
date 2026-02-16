import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  parseShipmentExcel,
  downloadShipmentTemplate,
  groupByShipment,
  type ShipmentImportRow,
  type ShipmentImportError,
} from "@/lib/shipment-excel-utils";
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";

export default function ImportShipments() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ShipmentImportRow[]>([]);
  const [errors, setErrors] = useState<ShipmentImportError[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [matchResults, setMatchResults] = useState<{ matched: number; unmatched: string[] }>({ matched: 0, unmatched: [] });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDone(false);
    setMatchResults({ matched: 0, unmatched: [] });

    const buffer = await file.arrayBuffer();
    const result = parseShipmentExcel(buffer);
    setRows(result.rows);
    setErrors(result.errors);

    if (result.rows.length > 0) {
      // Check producer matching
      const codes = [...new Set(result.rows.map((r) => r.code_plantation))];
      const { data: producers } = await supabase
        .from("producers")
        .select("plantation_code")
        .in("plantation_code", codes);

      const foundCodes = new Set((producers || []).map((p) => p.plantation_code));
      const unmatched = codes.filter((c) => !foundCodes.has(c));
      setMatchResults({ matched: codes.length - unmatched.length, unmatched });

      if (result.errors.length === 0 && unmatched.length === 0) {
        toast({ title: "Fichier valide", description: `${result.rows.length} lignes prêtes à importer.` });
      } else if (unmatched.length > 0) {
        toast({
          title: "Producteurs non trouvés",
          description: `${unmatched.length} code(s) plantation non trouvé(s) dans la base.`,
          variant: "destructive",
        });
      }
    }

    if (result.errors.length > 0) {
      toast({ title: "Erreurs détectées", description: `${result.errors.length} ligne(s) ignorée(s).`, variant: "destructive" });
    }
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setSaving(true);

    try {
      // Get all producers for matching
      const allCodes = [...new Set(rows.map((r) => r.code_plantation))];
      const { data: producers } = await supabase
        .from("producers")
        .select("id, plantation_code, remaining_potential")
        .in("plantation_code", allCodes);

      const producerMap = new Map((producers || []).map((p) => [p.plantation_code, p]));

      // Get all partners
      const { data: existingPartners } = await supabase.from("partners").select("id, name");
      const partnerMap = new Map((existingPartners || []).map((p) => [p.name.toLowerCase(), p.id]));

      // Group by shipment
      const groups = groupByShipment(rows);
      let totalDeliveries = 0;
      let totalShipments = 0;

      for (const [, group] of Object.entries(groups)) {
        const first = group[0];

        // Resolve partner
        let partnerId: string | null = null;
        if (first.partenaire) {
          partnerId = partnerMap.get(first.partenaire.toLowerCase()) || null;
          if (!partnerId) {
            const { data: newPartner } = await supabase
              .from("partners")
              .insert({ name: first.partenaire })
              .select()
              .single();
            if (newPartner) {
              partnerId = newPartner.id;
              partnerMap.set(first.partenaire.toLowerCase(), newPartner.id);
            }
          }
        }

        const totalWeight = first.poids_total || group.reduce((s, r) => s + r.poids_net, 0);
        const totalBags = first.nombre_sacs || group.reduce((s, r) => s + r.nombre_sacs_producteur, 0);

        // Create shipment
        const { data: shipment, error: shipErr } = await supabase
          .from("shipments")
          .insert({
            connaissement: first.connaissement || null,
            total_weight: totalWeight,
            total_bags: totalBags,
            avg_bag_weight: totalBags > 0 ? totalWeight / totalBags : 0,
            project: first.projet || "Ordinaire",
            partner_id: partnerId,
            zone: first.zone || null,
            destination: first.destination || "Abidjan",
            campaign: first.campagne || "Principale",
            delivery_start: first.date_debut_livraison || first.date_livraison,
            delivery_end: first.date_fin_livraison || first.date_livraison,
          })
          .select()
          .single();

        if (shipErr) throw shipErr;
        totalShipments++;

        // Create deliveries
        const deliveries = group
          .filter((r) => producerMap.has(r.code_plantation))
          .map((r) => ({
            shipment_id: shipment.id,
            producer_id: producerMap.get(r.code_plantation)!.id,
            receipt_number: r.numero_recu,
            delivery_date: r.date_livraison || first.date_debut_livraison,
            net_weight: r.poids_net,
            num_bags: r.nombre_sacs_producteur,
          }));

        if (deliveries.length > 0) {
          const { error: delErr } = await supabase.from("deliveries").insert(deliveries);
          if (delErr) throw delErr;
          totalDeliveries += deliveries.length;
        }

        // Update remaining potentials
        for (const r of group) {
          const producer = producerMap.get(r.code_plantation);
          if (producer) {
            const newPotential = Math.max(0, Number(producer.remaining_potential) - r.poids_net);
            await supabase
              .from("producers")
              .update({ remaining_potential: newPotential })
              .eq("id", producer.id);
            producer.remaining_potential = newPotential;
          }
        }
      }

      toast({
        title: "Importation réussie",
        description: `${totalShipments} chargement(s) et ${totalDeliveries} livraison(s) importé(s).`,
      });
      setDone(true);
      setRows([]);
    } catch (err: any) {
      toast({ title: "Erreur d'importation", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Detect max receipt number
  const maxReceipt = rows.length > 0
    ? rows.reduce((max, r) => {
        const num = parseInt(r.numero_recu, 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0)
    : 0;

  const shipmentGroups = rows.length > 0 ? Object.entries(groupByShipment(rows)) : [];

  return (
    <div className="space-y-6">
      {/* Download template + Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importer les anciens chargements
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Téléchargez le modèle Excel, remplissez-le avec les données de vos anciens chargements, puis importez le fichier.
            Le système reconnaîtra automatiquement le dernier N° de reçu.
          </p>
          <div className="flex gap-3 flex-wrap">
            <Button variant="outline" onClick={downloadShipmentTemplate}>
              <Download className="h-4 w-4 mr-2" /> Télécharger le modèle
            </Button>
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Charger un fichier Excel
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
          </div>
        </CardContent>
      </Card>

      {/* Match & receipt info */}
      {rows.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold">{rows.length}</p>
              <p className="text-sm text-muted-foreground">Lignes valides</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold">{shipmentGroups.length}</p>
              <p className="text-sm text-muted-foreground">Chargement(s) détecté(s)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold font-mono">{String(maxReceipt).padStart(6, "0")}</p>
              <p className="text-sm text-muted-foreground">Dernier N° Reçu détecté</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Matching status */}
      {rows.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              {matchResults.unmatched.length === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
              <span className="text-sm font-medium">
                {matchResults.matched} producteur(s) trouvé(s) dans la base
                {matchResults.unmatched.length > 0 &&
                  ` — ${matchResults.unmatched.length} non trouvé(s)`}
              </span>
            </div>
            {matchResults.unmatched.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {matchResults.unmatched.map((code) => (
                  <Badge key={code} variant="destructive" className="text-xs">
                    {code}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Erreurs ({errors.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {errors.slice(0, 20).map((e, i) => (
                <li key={i}>Ligne {e.row} : {e.message}</li>
              ))}
              {errors.length > 20 && <li className="text-muted-foreground">... et {errors.length - 20} autres</li>}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Aperçu des données</CardTitle>
              <Button
                onClick={handleImport}
                disabled={saving || matchResults.unmatched.length > 0}
              >
                {saving ? "Importation..." : "Valider et importer"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[50vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Reçu</TableHead>
                    <TableHead>Connaissement</TableHead>
                    <TableHead>Producteur</TableHead>
                    <TableHead>Code plantation</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Poids net</TableHead>
                    <TableHead>Sacs</TableHead>
                    <TableHead>Date livraison</TableHead>
                    <TableHead>Projet</TableHead>
                    <TableHead>Destination</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 100).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{r.numero_recu}</TableCell>
                      <TableCell>{r.connaissement || "—"}</TableCell>
                      <TableCell>{r.nom_producteur}</TableCell>
                      <TableCell>{r.code_plantation}</TableCell>
                      <TableCell>{r.section}</TableCell>
                      <TableCell>{r.poids_net.toLocaleString("fr-FR")}</TableCell>
                      <TableCell>{r.nombre_sacs_producteur}</TableCell>
                      <TableCell>{r.date_livraison}</TableCell>
                      <TableCell>{r.projet}</TableCell>
                      <TableCell>{r.destination}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 100 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Affichage des 100 premières lignes sur {rows.length}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success */}
      {done && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950/20">
          <CardContent className="flex items-center gap-3 pt-6">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-sm font-medium">Importation terminée. Les chargements sont visibles dans l'historique.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
