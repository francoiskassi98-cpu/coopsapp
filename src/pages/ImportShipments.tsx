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
  type MatchedProducer,
} from "@/lib/shipment-excel-utils";
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, User } from "lucide-react";
import PageHeader from "@/components/PageHeader";

export default function ImportShipments() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ShipmentImportRow[]>([]);
  const [errors, setErrors] = useState<ShipmentImportError[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [matchedProducers, setMatchedProducers] = useState<MatchedProducer[]>([]);
  const [potentialWarnings, setPotentialWarnings] = useState<string[]>([]);
  const [delayWarnings, setDelayWarnings] = useState<string[]>([]);

  /** Ligne minimale insérée dans `deliveries` lors d'un import historique. */
  type DeliveryInsert = {
    shipment_id: string;
    producer_id: string;
    receipt_number: string;
    delivery_date: string;
    net_weight: number;
    num_bags: number;
  };

  /** Producteur tel que retourné par les recherches par code plantation. */
  type ProducerLookup = {
    id?: string;
    plantation_code: string;
    full_name?: string;
    section?: string;
    registre_id?: string;
    remaining_potential?: number | string | null;
    registres?: { name: string } | null;
  };

  // Helper: chunked insert for deliveries
  async function chunkedInsertDeliveries(rows: DeliveryInsert[], chunkSize = 500) {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase.from("deliveries").insert(chunk as never);
      if (error) throw error;
    }
  }

  // Helper: chunked .in() for producers
  async function chunkedProducerLookup(
    selectCols: string,
    codes: string[],
    chunkSize = 500
  ): Promise<ProducerLookup[]> {
    const results: ProducerLookup[] = [];
    for (let i = 0; i < codes.length; i += chunkSize) {
      const chunk = codes.slice(i, i + chunkSize);
      const { data } = await supabase
        .from("producers")
        .select(selectCols)
        .in("plantation_code", chunk)
        .returns<ProducerLookup[]>();
      if (data) results.push(...data);
    }
    return results;
  }


  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDone(false);
    setMatchedProducers([]);
    setPotentialWarnings([]);
    setDelayWarnings([]);
    

    const buffer = await file.arrayBuffer();
    const result = await parseShipmentExcel(buffer);
    setRows(result.rows);
    setErrors(result.errors);

    if (result.rows.length > 0) {
      const codes = [...new Set(result.rows.map((r) => r.code_plantation))];
      const producers = await chunkedProducerLookup(
        "plantation_code, full_name, section, registre_id, remaining_potential, registres(name)",
        codes
      );

      const producerMap = new Map<string, ProducerLookup>(
        producers.map((p) => [p.plantation_code, p])
      );

      const matched: MatchedProducer[] = codes.map((code) => {
        const dbProducer = producerMap.get(code);

        const fileRow = result.rows.find((r) => r.code_plantation === code);
        return {
          code_plantation: code,
          db_full_name: dbProducer?.full_name || "",
          db_section: dbProducer?.section || "",
          db_cooperative: dbProducer?.registres?.name || "",
          db_remaining_potential: Number(dbProducer?.remaining_potential || 0),
          file_nom_producteur: fileRow?.nom_producteur || "",
          matched: !!dbProducer,
        };
      });
      setMatchedProducers(matched);

      // Check potential exceeded
      const weightByCode: Record<string, number> = {};
      for (const r of result.rows) {
        weightByCode[r.code_plantation] = (weightByCode[r.code_plantation] || 0) + r.poids_net;
      }
      const potWarn: string[] = [];
      for (const [code, totalW] of Object.entries(weightByCode)) {
        const potential = producerMap.get(code)?.remaining_potential;
        if (potential !== undefined && totalW > Number(potential)) {
          potWarn.push(`${code} (${totalW.toLocaleString("fr-FR")} kg > potentiel ${Number(potential).toLocaleString("fr-FR")} kg)`);
        }
      }
      setPotentialWarnings(potWarn);

      // No 2-week delay check for historical imports

      // No duplicate check for historical imports

      const unmatchedCount = matched.filter((m) => !m.matched).length;
      if (result.errors.length === 0 && unmatchedCount === 0 && potWarn.length === 0) {
        toast({ title: "Fichier valide", description: `${result.rows.length} lignes prêtes à importer.` });
      }
      if (unmatchedCount > 0) {
        toast({ title: "Producteurs non trouvés", description: `${unmatchedCount} code(s) plantation non trouvé(s) dans le registre.`, variant: "destructive" });
      }
      if (potWarn.length > 0) {
        toast({ title: "Dépassement de potentiel", description: `${potWarn.length} producteur(s) dépassent leur estimation.`, variant: "destructive" });
      }
    }

    if (result.errors.length > 0) {
      toast({ title: "Erreurs détectées", description: `${result.errors.length} ligne(s) ignorée(s).`, variant: "destructive" });
    }
  };

  const unmatchedCount = matchedProducers.filter((m) => !m.matched).length;
  const canImport = rows.length > 0 && unmatchedCount === 0;

  const handleImportClick = () => {
    if (!canImport) return;
    executeImport(rows);
  };

  const executeImport = async (importRows: ShipmentImportRow[]) => {
    if (importRows.length === 0) return;
    setSaving(true);

    try {
      const allCodes = [...new Set(importRows.map((r) => r.code_plantation))];
      const producers = await chunkedProducerLookup("id, plantation_code, remaining_potential", allCodes);

      const producerMap = new Map<string, ProducerLookup>(producers.map((p) => [p.plantation_code, p]));

      const { data: existingPartners } = await supabase.from("partners").select("id, name");
      const partnerMap = new Map<string, string>((existingPartners ?? []).map((p) => [p.name.toLowerCase(), p.id]));

      // Load registres for mapping zone -> registre_id
      const { data: regsData } = await supabase.from("registres").select("id, name, cooperative_id");
      const regNameToId = new Map<string, string>((regsData ?? []).map((r) => [r.name.toLowerCase(), r.id]));
      const regIdToCoopId = new Map<string, string>((regsData ?? []).map((r) => [r.id, r.cooperative_id]));


      const groups = groupByShipment(importRows);
      let totalDeliveries = 0;
      let totalShipments = 0;

      for (const [, group] of Object.entries(groups)) {
        const first = group[0];
        const campaignLabel = detectCampaignFromDate(first.date_livraison);

        // Resolve registre_id from zone name
        let registreId: string | null = null;
        if (first.zone) {
          registreId = regNameToId.get(first.zone.toLowerCase()) || null;
        }
        if (!registreId) {
          throw new Error(`Registre introuvable pour la zone "${first.zone || "(vide)"}". Créez-le d'abord.`);
        }

        let partnerId: string | null = null;
        if (first.partenaire) {
          partnerId = partnerMap.get(first.partenaire.toLowerCase()) || null;
          if (!partnerId) {
            const { data: newPartner } = await supabase
              .from("partners")
              .insert({ name: first.partenaire, cooperative_id: regIdToCoopId.get(registreId) as string })
              .select("id")
              .single();

            if (newPartner) {
              partnerId = newPartner.id;
              partnerMap.set(first.partenaire.toLowerCase(), newPartner.id);
            }
          }
        }

        const totalWeight = group.reduce((s, r) => s + r.poids_net, 0);
        const totalBags = group.reduce((s, r) => s + r.nombre_sacs, 0);

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
            registre_id: registreId,
            destination: first.destination || "Abidjan",
            campaign_label: campaignLabel || null,
            delivery_start: deliveryStart,
            delivery_end: deliveryEnd,
          } as never)
          .select("id")
          .single();

        if (shipErr) throw shipErr;
        totalShipments++;

        const deliveries: DeliveryInsert[] = group
          .filter((r) => producerMap.has(r.code_plantation))
          .map((r) => ({
            shipment_id: (shipment as { id: string }).id,
            producer_id: producerMap.get(r.code_plantation)!.id as string,
            receipt_number: r.numero_recu,
            delivery_date: r.date_livraison || deliveryStart,
            net_weight: r.poids_net,
            num_bags: r.nombre_sacs,
          }));


        if (deliveries.length > 0) {
          await chunkedInsertDeliveries(deliveries);
          totalDeliveries += deliveries.length;
        }

        for (const r of group) {
          const producer = producerMap.get(r.code_plantation);
          if (producer) {
            const newPotential = Math.max(0, Number(producer.remaining_potential) - r.poids_net);
            await supabase.from("producers").update({ remaining_potential: newPotential }).eq("id", producer.id as string);
            producer.remaining_potential = newPotential;
          }
        }
      }

      toast({ title: "Importation réussie", description: `${totalShipments} chargement(s) et ${totalDeliveries} livraison(s) importé(s).` });
      setDone(true);
      setRows([]);
    } catch (err: unknown) {

      (console.error(err), toast({ title: "Erreur d'importation", description: "Une erreur est survenue.", variant: "destructive" }));
    } finally {
      setSaving(false);
    }
  };

  const maxReceipt = rows.length > 0
    ? rows.reduce((max, r) => { const num = parseInt(r.numero_recu, 10); return isNaN(num) ? max : Math.max(max, num); }, 0)
    : 0;

  const shipmentGroups = rows.length > 0 ? Object.entries(groupByShipment(rows)) : [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={FileSpreadsheet}
        title="Importer les anciens chargements"
        description="Reprise historique des chargements existants dans le système."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importer les anciens chargements
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Téléchargez le modèle Excel, remplissez-le avec les données de vos anciens chargements, puis importez le fichier.
            Le système fait correspondre chaque code plantation avec le registre producteurs importé dans l'analyse des données.
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

      {/* Producer matching with registry details */}
      {matchedProducers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-5 w-5" /> Correspondance avec le registre producteurs ({matchedProducers.filter((m) => m.matched).length}/{matchedProducers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {unmatchedCount === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-600 mb-3">
                <CheckCircle2 className="h-4 w-4" />
                Tous les producteurs correspondent au registre.
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-destructive mb-3">
                <AlertCircle className="h-4 w-4" />
                {unmatchedCount} producteur(s) non trouvé(s) dans le registre. Importez-les d'abord via « Analyse des données ».
              </div>
            )}
            <div className="max-h-60 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code plantation</TableHead>
                    <TableHead>Nom (fichier)</TableHead>
                    <TableHead>Nom (registre)</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Registre</TableHead>
                    <TableHead>Potentiel restant</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchedProducers.map((m) => (
                    <TableRow key={m.code_plantation} className={!m.matched ? "bg-destructive/5" : ""}>
                      <TableCell className="font-mono text-xs">{m.code_plantation}</TableCell>
                      <TableCell>{m.file_nom_producteur}</TableCell>
                      <TableCell>{m.matched ? m.db_full_name : "—"}</TableCell>
                      <TableCell>{m.matched ? m.db_section : "—"}</TableCell>
                      <TableCell>{m.matched ? m.db_cooperative : "—"}</TableCell>
                      <TableCell>{m.matched ? `${m.db_remaining_potential.toLocaleString("fr-FR")} kg` : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={m.matched ? "default" : "destructive"} className="text-xs">
                          {m.matched ? "Trouvé" : "Non trouvé"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
              <Button onClick={handleImportClick} disabled={saving || !canImport}>
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
                    <TableHead>Partenaire</TableHead>
                    <TableHead>Producteur</TableHead>
                    <TableHead>Code plantation</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Poids net (kg)</TableHead>
                    <TableHead>Sacs</TableHead>
                    <TableHead>Date livraison</TableHead>
                    <TableHead>Campagne</TableHead>
                    <TableHead>Projet</TableHead>
                    <TableHead>Destination</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{r.numero_recu}</TableCell>
                      <TableCell>{r.connaissement || "—"}</TableCell>
                      <TableCell>{r.partenaire || "—"}</TableCell>
                      <TableCell>{r.nom_producteur}</TableCell>
                      <TableCell>{r.code_plantation}</TableCell>
                      <TableCell>{r.section}</TableCell>
                      <TableCell>{r.poids_net.toLocaleString("fr-FR")}</TableCell>
                      <TableCell>{r.nombre_sacs}</TableCell>
                      <TableCell>{r.date_livraison}</TableCell>
                      <TableCell className="text-xs">{detectCampaignFromDate(r.date_livraison)}</TableCell>
                      <TableCell>{r.projet}</TableCell>
                      <TableCell>{r.destination}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
