import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { parseExcelFile, downloadImportTemplate, type ProducerRow, type ImportError } from "@/lib/excel-utils";
import { useCampaigns } from "@/hooks/useActiveCampaign";
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, Download, Calendar } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import PageHeader from "@/components/PageHeader";

export default function ImportProducers() {
  const { campaigns } = useCampaigns();
  const [campaignId, setCampaignId] = useState<string>("");
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ProducerRow[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    // default to campaign used for shipments
    const def = campaigns.find((c) => c.utilise_pour_chargement) ?? campaigns[0];
    if (def && !campaignId) setCampaignId(def.id);
  }, [campaigns, campaignId]);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setImported(false);
    const buffer = await f.arrayBuffer();
    const { rows, errors } = await parseExcelFile(buffer);
    setParsedRows(rows);
    setErrors(errors);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const confirmImport = async () => {
    if (!campaignId) {
      toast({ title: "Campagne requise", description: "Sélectionnez ou créez une campagne avant d'importer.", variant: "destructive" });
      return;
    }
    if (parsedRows.length === 0) return;
    setImporting(true);
    try {
      // Sync cooperatives table
      const uniqueCoops = [...new Set(parsedRows.map((r) => r.cooperative).filter(Boolean))];
      if (uniqueCoops.length > 0) {
        const { data: existingCoops } = await supabase.from("cooperatives").select("name");
        const existingNames = new Set((existingCoops || []).map((c) => c.name.toLowerCase()));
        const newCoops = uniqueCoops.filter((c) => !existingNames.has(c.toLowerCase()));
        if (newCoops.length > 0) {
          await supabase.from("cooperatives").insert(newCoops.map((name) => ({ name })));
        }
      }

      // Optionally replace registry of this campaign
      if (replaceExisting) {
        await (supabase.from as any)("producer_registry").delete().eq("campaign_label", campaignId);
      }

      const toInsert = parsedRows.map((r) => ({
        campaign_label: campaignId,
        cooperative: r.cooperative,
        nom_complet: r.full_name,
        numero_producteur: r.producer_number || null,
        cni: r.national_id || null,
        code_producteur: r.producer_code || null,
        sexe: r.sexe || null,
        section: r.section,
        surface_cacao_totale: r.total_cocoa_area || null,
        code_plantation: r.plantation_code,
        potentiel_livraison: r.delivery_potential || 0,
        potentiel_restant: r.delivery_potential || 0,
        latitude: r.latitude || null,
        longitude: r.longitude || null,
        num_men: r.num_men || 0,
        num_women: r.num_women || 0,
        actif: true,
      }));

      // bulk insert in batches
      for (let i = 0; i < toInsert.length; i += 200) {
        const batch = toInsert.slice(i, i + 200);
        const { error } = await (supabase.from as any)("producer_registry").insert(batch);
        if (error) throw error;
      }

      toast({
        title: "Importation réussie",
        description: `${toInsert.length} producteur(s) importé(s) dans la campagne.`,
      });
      setImported(true);
    } catch (err: any) {
      (console.error(err), toast({ title: "Erreur d'importation", description: "Une erreur est survenue.", variant: "destructive" }));
    } finally {
      setImporting(false);
    }
  };

  const selectedCampaign = campaigns.find((c) => c.id === campaignId);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={Upload}
        title="Importation du registre producteurs"
        actions={
          <Button variant="outline" onClick={downloadImportTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Télécharger le modèle Excel
          </Button>
        }
      />

      {/* Campaign selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            1. Choisir la campagne
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner une campagne" />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nom} {c.utilise_pour_chargement ? "• Chargements" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {campaigns.length === 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Aucune campagne. Créez-en une depuis la page « Campagnes » avant d'importer.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-2">
            <Checkbox id="replace" checked={replaceExisting} onCheckedChange={(v) => setReplaceExisting(!!v)} />
            <label htmlFor="replace" className="text-sm">
              Remplacer le registre existant de cette campagne
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Drop zone */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Déposer le fichier Excel</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-2">
              Glissez-déposez un fichier Excel ici, ou
            </p>
            <label>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={onFileSelect} className="hidden" />
              <Button variant="outline" asChild>
                <span className="cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Sélectionner un fichier
                </span>
              </Button>
            </label>
            {file && <p className="mt-3 text-sm font-medium">{file.name}</p>}
          </div>
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              {errors.length} erreur(s) détectée(s)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-48 overflow-auto space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-sm text-destructive">Ligne {e.row} : {e.message}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {parsedRows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-accent" />
                {parsedRows.length} producteur(s) prêt(s) à importer
                {selectedCampaign && <span className="text-sm text-muted-foreground"> → {selectedCampaign.nom}</span>}
              </CardTitle>
              <Button onClick={confirmImport} disabled={importing || imported || !campaignId}>
                {importing ? "Importation..." : imported ? "Importé ✓" : "Confirmer l'importation"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom complet</TableHead>
                    <TableHead>Sexe</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Code plantation</TableHead>
                    <TableHead>Potentiel (kg)</TableHead>
                    <TableHead>Registre</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 50).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.full_name}</TableCell>
                      <TableCell>{r.sexe || "—"}</TableCell>
                      <TableCell>{r.section}</TableCell>
                      <TableCell className="font-mono text-xs">{r.plantation_code}</TableCell>
                      <TableCell>{r.delivery_potential.toLocaleString("fr-FR")}</TableCell>
                      <TableCell>{r.cooperative}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsedRows.length > 50 && (
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  ... et {parsedRows.length - 50} autres lignes
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
