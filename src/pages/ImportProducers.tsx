import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { parseExcelFile, downloadImportTemplate, type ProducerRow, type ImportError } from "@/lib/excel-utils";
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, Download } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";

export default function ImportProducers() {
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
    const { rows, errors } = parseExcelFile(buffer);
    setParsedRows(rows);
    setErrors(errors);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const confirmImport = async () => {
    if (parsedRows.length === 0) return;
    setImporting(true);
    try {
      // Check existing plantation codes
      const { data: existing } = await supabase.from("producers").select("plantation_code");
      const existingCodes = new Set((existing || []).map((p) => p.plantation_code));

      const newRows = parsedRows.filter((r) => !existingCodes.has(r.plantation_code));
      const duplicates = parsedRows.filter((r) => existingCodes.has(r.plantation_code));

      if (duplicates.length > 0) {
        toast({
          title: "Codes plantation déjà existants",
          description: `${duplicates.length} producteur(s) ignoré(s) car le code plantation existe déjà.`,
          variant: "destructive",
        });
      }

      if (newRows.length > 0) {
        const toInsert = newRows.map((r) => ({
          ...r,
          remaining_potential: r.delivery_potential,
          sexe: r.sexe || null,
        }));

        // Insert in batches of 100
        for (let i = 0; i < toInsert.length; i += 100) {
          const batch = toInsert.slice(i, i + 100);
          const { error } = await supabase.from("producers").insert(batch);
          if (error) throw error;
        }

        toast({
          title: "Importation réussie",
          description: `${newRows.length} producteur(s) importé(s) avec succès.`,
        });
        setImported(true);
      }
    } catch (err: any) {
      toast({ title: "Erreur d'importation", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Importation des producteurs</h1>
        <Button variant="outline" onClick={downloadImportTemplate}>
          <Download className="h-4 w-4 mr-2" />
          Télécharger le modèle Excel
        </Button>
      </div>

      {/* Drop zone */}
      <Card>
        <CardContent className="p-8">
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

      {/* Errors */}
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
                <p key={i} className="text-sm text-destructive">
                  Ligne {e.row} : {e.message}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
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
                    <TableHead>Coopérative</TableHead>
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
