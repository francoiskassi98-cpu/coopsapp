import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { parseExcelFile, downloadImportTemplate, type ProducerRow, type ImportError } from "@/lib/excel-utils";
import { useAuth } from "@/hooks/useAuth";
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, Download } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import PageHeader from "@/components/PageHeader";

export default function ImportProducers() {
  const { cooperativeRefs, isSuperAdmin } = useAuth();
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ProducerRow[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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

  async function resolveRegistreIds(names: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const uniq = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
    if (uniq.length === 0) return map;
    const { data: existing, error } = await (supabase as any).from("registres").select("id, name");
    if (error) throw error;
    const byName = new Map<string, string>();
    (existing || []).forEach((r: any) => byName.set(r.name.trim().toLowerCase(), r.id));
    const missing: string[] = [];
    for (const n of uniq) {
      const id = byName.get(n.toLowerCase());
      if (id) map.set(n.toLowerCase(), id);
      else missing.push(n);
    }
    if (missing.length > 0) {
      const coopId = cooperativeRefs[0]?.id;
      if (!coopId) throw new Error(`Registres introuvables : ${missing.join(", ")}.`);
      const toCreate = missing.map((name) => ({ name, cooperative_id: coopId, status: "active" }));
      const { data: created, error: cErr } = await (supabase as any).from("registres").insert(toCreate).select("id, name");
      if (cErr) throw cErr;
      (created || []).forEach((r: any) => map.set(r.name.trim().toLowerCase(), r.id));
    }
    return map;
  }

  const confirmImport = async () => {
    if (parsedRows.length === 0) return;
    setImporting(true);
    try {
      const registreMap = await resolveRegistreIds(parsedRows.map((r) => r.cooperative));

      const toInsert = parsedRows.map((r) => ({
        registre_id: registreMap.get((r.cooperative || "").toLowerCase()) || null,
        campaign_label: r.campaign_label,
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
        actif: true,
      })).filter((r) => r.registre_id);

      if (replaceExisting) {
        const registreIds = Array.from(new Set(toInsert.map((r) => r.registre_id)));
        const campaignLabels = Array.from(new Set(toInsert.map((r) => r.campaign_label)));
        for (const rid of registreIds) {
          for (const cl of campaignLabels) {
            await (supabase.from as any)("producer_registry").delete().eq("registre_id", rid).eq("campaign_label", cl);
          }
        }
      }

      for (let i = 0; i < toInsert.length; i += 200) {
        const batch = toInsert.slice(i, i + 200);
        const { error } = await (supabase.from as any)("producer_registry").insert(batch);
        if (error) throw error;
      }

      toast({ title: "Importation réussie", description: `${toInsert.length} producteur(s) importé(s).` });
      setImported(true);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erreur d'importation", description: err?.message || "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Déposer le fichier Excel</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-2">Glissez-déposez un fichier Excel ici, ou</p>
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
          <div className="flex items-center gap-2 mt-4">
            <Checkbox id="replace" checked={replaceExisting} onCheckedChange={(v) => setReplaceExisting(!!v)} />
            <label htmlFor="replace" className="text-sm">
              Remplacer le registre existant pour la même campagne
            </label>
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
              </CardTitle>
              <Button onClick={confirmImport} disabled={importing || imported}>
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
                    <TableHead>Campagne</TableHead>
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
                      <TableCell>{r.campaign_label}</TableCell>
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
