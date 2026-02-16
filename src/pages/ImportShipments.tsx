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
  detectCampaignFromDate,
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
  const [potentialWarnings, setPotentialWarnings] = useState<string[]>([]);
  const [delayWarnings, setDelayWarnings] = useState<string[]>([]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDone(false);
    setMatchResults({ matched: 0, unmatched: [] });
    setPotentialWarnings([]);
    setDelayWarnings([]);

    const buffer = await file.arrayBuffer();
    const result = parseShipmentExcel(buffer);
    setRows(result.rows);
    setErrors(result.errors);

    if (result.rows.length > 0) {
      const codes = [...new Set(result.rows.map((r) => r.code_plantation))];
      const { data: producers } = await supabase
        .from("producers")
        .select("plantation_code, remaining_potential")
        .in("plantation_code", codes);

      const producerMap = new Map((producers || []).map((p) => [p.plantation_code, Number(p.remaining_potential)]));
      const foundCodes = new Set((producers || []).map((p) => p.plantation_code));
      const unmatched = codes.filter((c) => !foundCodes.has(c));
      setMatchResults({ matched: codes.length - unmatched.length, unmatched });

      // Check potential exceeded
      const weightByCode: Record<string, number> = {};
      for (const r of result.rows) {
        weightByCode[r.code_plantation] = (weightByCode[r.code_plantation] || 0) + r.poids_net;
      }
      const potWarn: string[] = [];
      for (const [code, totalW] of Object.entries(weightByCode)) {
        const potential = producerMap.get(code);
        if (potential !== undefined && totalW > potential) {
          potWarn.push(`${code} (${totalW.toLocaleString("fr-FR")} kg > potentiel ${potential.toLocaleString("fr-FR")} kg)`);
        }
      }
      setPotentialWarnings(potWarn);

      // Check 2-week delay between shipments for same producer
      const datesByCode: Record<string, string[]> = {};
      for (const r of result.rows) {
        if (!datesByCode[r.code_plantation]) datesByCode[r.code_plantation] = [];
        if (r.date_livraison) datesByCode[r.code_plantation].push(r.date_livraison);
      }
      const delWarn: string[] = [];
      for (const [code, dates] of Object.entries(datesByCode)) {
        const sorted = dates.sort();
        for (let i = 1; i < sorted.length; i++) {
          const diff = (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / (1000 * 60 * 60 * 24);
          if (diff < 14) {
            delWarn.push(`${code} : ${sorted[i - 1]} → ${sorted[i]} (${Math.round(diff)}j < 14j)`);
          }
        }
      }
      setDelayWarnings(delWarn);

      if (result.errors.length === 0 && unmatched.length === 0 && potWarn.length === 0) {
        toast({ title: "Fichier valide", description: `${result.rows.length} lignes prêtes à importer.` });
      }
      if (unmatched.length > 0) {
        toast({ title: "Producteurs non trouvés", description: `${unmatched.length} code(s) plantation non trouvé(s).`, variant: "destructive" });
      }
      if (potWarn.length > 0) {
        toast({ title: "Dépassement de potentiel", description: `${potWarn.length} producteur(s) dépassent leur estimation.`, variant: "destructive" });
      }
    }

    if (result.errors.length > 0) {
      toast({ title: "Erreurs détectées", description: `${result.errors.length} ligne(s) ignorée(s).`, variant: "destructive" });
    }
  };

  const canImport = rows.length > 0 && matchResults.unmatched.length === 0 && potentialWarnings.length === 0;

  const handleImport = async () => {
    if (!canImport) return;
    setSaving(true);

    try {
      const allCodes = [...new Set(rows.map((r) => r.code_plantation))];
      const { data: producers } = await supabase
        .from("producers")
        .select("id, plantation_code, remaining_potential")
        .in("plantation_code", allCodes);

      const producerMap = new Map((producers || []).map((p) => [p.plantation_code, p]));

      const { data: existingPartners } = await supabase.from("partners").select("id, name");
      const partnerMap = new Map((existingPartners || []).map((p) => [p.name.toLowerCase(), p.id]));

      const groups = groupByShipment(rows);
      let totalDeliveries = 0;
      let totalShipments = 0;

      for (const [, group] of Object.entries(groups)) {
        const first = group[0];
        const campaign = detectCampaignFromDate(first.date_livraison);

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

        const dates = group.map((r) => r.date_livraison).filter(Boolean).sort();
        const deliveryStart = dates[0] || first.date_livraison;
        const deliveryEnd = dates[dates.length - 1] || first.date_livraison;

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
            campaign: campaign || "Principale",
            delivery_start: deliveryStart,
            delivery_end: deliveryEnd,
          })
          .select()
          .single();

        if (shipErr) throw shipErr;
        totalShipments++;

        const deliveries = group
          .filter((r) => producerMap.has(r.code_plantation))
          .map((r) => ({
            shipment_id: shipment.id,
            producer_id: producerMap.get(r.code_plantation)!.id,
            receipt_number: r.numero_recu,
            delivery_date: r.date_livraison || deliveryStart,
            net_weight: r.poids_net,
            num_bags: r.nombre_sacs_producteur,
          }));

        if (deliveries.length > 0) {
          const { error: delErr } = await supabase.from("deliveries").insert(deliveries);
          if (delErr) throw delErr;
          totalDeliveries += deliveries.length;
        }

        for (const r of group) {
          const producer = producerMap.get(r.code_plantation);
          if (producer) {
            const newPotential = Math.max(0, Number(producer.remaining_potential) - r.poids_net);
            await supabase.from("producers").update({ remaining_potential: newPotential }).eq("id", producer.id);
            producer.remaining_potential = newPotential;
          }
        }
      }

      toast({ title: "Importation réussie", description: `${totalShipments} chargement(s) et ${totalDeliveries} livraison(s) importé(s).` });
      setDone(true);
      setRows([]);
    } catch (err: any) {
      toast({ title: "Erreur d'importation", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const maxReceipt = rows.length > 0
    ? rows.reduce((max, r) => { const num = parseInt(r.numero_recu, 10); return isNaN(num) ? max : Math.max(max, num); }, 0)
    : 0;

  const shipmentGroups = rows.length > 0 ? Object.entries(groupByShipment(rows)) : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importer les anciens chargements
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Téléchargez le modèle Excel, remplissez-le avec les données de vos anciens chargements, puis importez le fichier.
            La campagne est détectée automatiquement à partir de la date de livraison. Un délai de 2 semaines entre chargements par producteur est vérifié.
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
                {matchResults.matched} producteur(s) trouvé(s)
                {matchResults.unmatched.length > 0 && ` — ${matchResults.unmatched.length} non trouvé(s)`}
              </span>
            </div>
            {matchResults.unmatched.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {matchResults.unmatched.map((code) => (
                  <Badge key={code} variant="destructive" className="text-xs">{code}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Potential exceeded warnings */}
      {potentialWarnings.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" /> Dépassement d'estimation ({potentialWarnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {potentialWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 2-week delay warnings */}
      {delayWarnings.length > 0 && (
        <Card className="border-yellow-500">
          <CardHeader>
            <CardTitle className="text-base text-yellow-600 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" /> Délai insuffisant entre chargements ({delayWarnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {delayWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
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
              {errors.slice(0, 20).map((e, i) => <li key={i}>Ligne {e.row} : {e.message}</li>)}
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
              <Button onClick={handleImport} disabled={saving || !canImport}>
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
                    <TableHead>Campagne</TableHead>
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
                      <TableCell className="text-xs">{detectCampaignFromDate(r.date_livraison)}</TableCell>
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
