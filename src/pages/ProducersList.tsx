import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Search, Eye, Pencil, Trash2, Upload, RefreshCw, Download, FileSpreadsheet, CheckCircle, AlertCircle, ShieldOff } from "lucide-react";
import { useSortableTable, SortableHeader } from "@/hooks/useSortableTable";
import { toast } from "@/hooks/use-toast";
import { parseExcelFile, downloadImportTemplate, exportToExcel, type ProducerRow, type ImportError } from "@/lib/excel-utils";

type ImportMode = "insert" | "update";

export default function Producers() {
  const [producers, setProducers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [coopFilter, setCoopFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [detailProducer, setDetailProducer] = useState<any | null>(null);
  const [editProducer, setEditProducer] = useState<any | null>(null);
  const [deleteProducer, setDeleteProducer] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // Import state
  const [importMode, setImportMode] = useState<ImportMode | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ProducerRow[]>([]);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    loadProducers();
  }, []);

  async function loadProducers() {
    setLoading(true);
    let allData: any[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await supabase
        .from("producers")
        .select("*")
        .order("section", { ascending: true })
        .order("full_name", { ascending: true })
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    setProducers(allData);
    setLoading(false);
  }

  // Unique cooperatives for filter
  const cooperatives = useMemo(() => {
    const set = new Set<string>();
    producers.forEach((p) => {
      if (p.cooperative) set.add(p.cooperative);
    });
    return Array.from(set).sort();
  }, [producers]);

  const { sortConfig, toggleSort, sortData } = useSortableTable();

  const filtered = useMemo(() => {
    const base = producers.filter((p) => {
      if (coopFilter !== "all" && p.cooperative !== coopFilter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        p.full_name.toLowerCase().includes(s) ||
        p.plantation_code.toLowerCase().includes(s) ||
        p.section.toLowerCase().includes(s)
      );
    });
    return sortData(base, (item: any, col: string) => {
      if (col === "delivery_potential" || col === "remaining_potential") return Number(item[col]);
      return item[col];
    });
  }, [producers, coopFilter, search, sortConfig]);

  // --- Edit / Delete (existing) ---
  // Disabled sections state
  const [disabledSections, setDisabledSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDisabledSections();
  }, []);

  async function loadDisabledSections() {
    const { data } = await supabase.from("disabled_sections").select("section_name");
    setDisabledSections(new Set((data || []).map((d: any) => d.section_name)));
  }

  async function toggleSection(sectionName: string, cooperative: string) {
    if (disabledSections.has(sectionName)) {
      await supabase.from("disabled_sections").delete().eq("section_name", sectionName);
      toast({ title: `Section "${sectionName}" réactivée` });
    } else {
      await supabase.from("disabled_sections").insert({ section_name: sectionName, cooperative });
      toast({ title: `Section "${sectionName}" désactivée` });
    }
    loadDisabledSections();
  }

  // Get unique sections for the current filter
  const sections = useMemo(() => {
    const map = new Map<string, string>();
    producers.forEach((p) => {
      if (coopFilter === "all" || p.cooperative === coopFilter) {
        if (!map.has(p.section)) map.set(p.section, p.cooperative);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [producers, coopFilter]);

  function openEdit(p: any) {
    setEditForm({
      full_name: p.full_name,
      section: p.section,
      plantation_code: p.plantation_code,
      cooperative: p.cooperative,
      sexe: p.sexe || "",
      delivery_potential: p.delivery_potential,
      remaining_potential: p.remaining_potential,
      is_active: p.is_active !== false,
    });
    setEditProducer(p);
  }

  async function handleSaveEdit() {
    if (!editProducer) return;
    setSaving(true);
    const { error } = await supabase.from("producers").update(editForm).eq("id", editProducer.id);
    setSaving(false);
    if (error) {
      console.error(error);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } else {
      toast({ title: "Producteur modifié avec succès" });
      setEditProducer(null);
      loadProducers();
    }
  }

  async function handleDelete() {
    if (!deleteProducer) return;
    setSaving(true);
    const { error } = await supabase.from("producers").delete().eq("id", deleteProducer.id);
    setSaving(false);
    if (error) {
      console.error(error);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } else {
      toast({ title: "Producteur supprimé" });
      setDeleteProducer(null);
      loadProducers();
    }
  }

  // --- Export existing data ---
  async function handleExportProducers(cooperative?: string) {
    let data = producers;
    if (cooperative && cooperative !== "all") {
      data = producers.filter((p) => p.cooperative === cooperative);
    }
    if (data.length === 0) {
      toast({ title: "Aucune donnée à exporter", variant: "destructive" });
      return;
    }
    const rows = data.map((p) => ({
      "Coopérative": p.cooperative,
      "Nom complet": p.full_name,
      "N° producteur": p.producer_number || "",
      "CNI": p.national_id || "",
      "Code producteur": p.producer_code || "",
      "Sexe": p.sexe || "",
      "Section": p.section,
      "Surface cacao totale": p.total_cocoa_area || 0,
      "Nb parcelles": p.num_plots || 0,
      "Code plantation": p.plantation_code,
      "Potentiel livraison (kg)": p.delivery_potential,
      "Potentiel restant (kg)": p.remaining_potential,
      "Superficie": p.plantation_area || 0,
      "Latitude": p.latitude || 0,
      "Longitude": p.longitude || 0,
    }));
    const suffix = cooperative && cooperative !== "all" ? `-${cooperative}` : "";
    await exportToExcel(rows, `Registre-Producteurs${suffix}.xlsx`, "Producteurs");
    toast({ title: "Export réussi" });
  }

  // --- Import / Update logic ---
  function openImportDialog(mode: ImportMode) {
    setImportMode(mode);
    setImportFile(null);
    setParsedRows([]);
    setImportErrors([]);
    setImportDone(false);
  }

  const handleFile = useCallback(async (f: File) => {
    setImportFile(f);
    setImportDone(false);
    const buffer = await f.arrayBuffer();
    const { rows, errors } = await parseExcelFile(buffer);
    setParsedRows(rows);
    setImportErrors(errors);
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

  async function confirmImport() {
    if (parsedRows.length === 0) return;
    setImporting(true);

    try {
      // Sync cooperatives table
      const uniqueCoops = [...new Set(parsedRows.map(r => r.cooperative).filter(Boolean))];
      if (uniqueCoops.length > 0) {
        const { data: existingCoops } = await supabase.from("cooperatives").select("name");
        const existingNames = new Set((existingCoops || []).map(c => c.name.toLowerCase()));
        const newCoops = uniqueCoops.filter(c => !existingNames.has(c.toLowerCase()));
        if (newCoops.length > 0) {
          await supabase.from("cooperatives").insert(newCoops.map(name => ({ name })));
        }
      }

      if (importMode === "insert") {
        const allCodes = parsedRows.map((r) => r.plantation_code);
        const existingCodes = new Set<string>();
        for (let i = 0; i < allCodes.length; i += 500) {
          const chunk = allCodes.slice(i, i + 500);
          const { data } = await supabase.from("producers").select("plantation_code").in("plantation_code", chunk);
          (data || []).forEach((p) => existingCodes.add(p.plantation_code));
        }

        const newRows = parsedRows.filter((r) => !existingCodes.has(r.plantation_code));
        const skipped = parsedRows.length - newRows.length;

        if (skipped > 0) {
          toast({ title: `${skipped} producteur(s) ignoré(s)`, description: "Code plantation déjà existant.", variant: "destructive" });
        }

        if (newRows.length > 0) {
          const toInsert = newRows.map((r) => ({
            ...r,
            remaining_potential: r.delivery_potential,
            sexe: r.sexe || null,
          }));
          for (let i = 0; i < toInsert.length; i += 500) {
            const batch = toInsert.slice(i, i + 500);
            const { error } = await supabase.from("producers").insert(batch);
            if (error) throw error;
          }
          toast({ title: "Importation réussie", description: `${newRows.length} producteur(s) ajouté(s).` });
        }
      } else {
        // Update mode: upsert by plantation_code
        const allCodes = parsedRows.map((r) => r.plantation_code);
        const existingMap = new Map<string, any>();
        for (let i = 0; i < allCodes.length; i += 500) {
          const chunk = allCodes.slice(i, i + 500);
          const { data } = await supabase.from("producers").select("id, plantation_code").in("plantation_code", chunk);
          (data || []).forEach((p) => existingMap.set(p.plantation_code, p.id));
        }

        let updatedCount = 0;
        let insertedCount = 0;
        const toInsert: any[] = [];

        for (const r of parsedRows) {
          const existingId = existingMap.get(r.plantation_code);
          if (existingId) {
            const updateData: any = {
              cooperative: r.cooperative,
              full_name: r.full_name,
              producer_number: r.producer_number,
              national_id: r.national_id,
              producer_code: r.producer_code,
              sexe: r.sexe || null,
              section: r.section,
              total_cocoa_area: r.total_cocoa_area,
              num_plots: r.num_plots,
              delivery_potential: r.delivery_potential,
              remaining_potential: r.delivery_potential,
              plantation_area: r.plantation_area,
              latitude: r.latitude,
              longitude: r.longitude,
            };
            toInsert.push({ id: existingId, ...updateData, plantation_code: r.plantation_code });
            updatedCount++;
          } else {
            toInsert.push({
              cooperative: r.cooperative,
              full_name: r.full_name,
              producer_number: r.producer_number,
              national_id: r.national_id,
              producer_code: r.producer_code,
              sexe: r.sexe || null,
              section: r.section,
              total_cocoa_area: r.total_cocoa_area,
              num_plots: r.num_plots,
              plantation_code: r.plantation_code,
              delivery_potential: r.delivery_potential,
              remaining_potential: r.delivery_potential,
              plantation_area: r.plantation_area,
              latitude: r.latitude,
              longitude: r.longitude,
            });
            insertedCount++;
          }
        }

        for (let i = 0; i < toInsert.length; i += 500) {
          const batch = toInsert.slice(i, i + 500);
          const updates = batch.filter((r) => r.id);
          const inserts = batch.filter((r) => !r.id);

          if (updates.length > 0) {
            for (const u of updates) {
              const { id, ...rest } = u;
              const { error } = await supabase.from("producers").update(rest).eq("id", id);
              if (error) throw error;
            }
          }
          if (inserts.length > 0) {
            const { error } = await supabase.from("producers").insert(inserts);
            if (error) throw error;
          }
        }

        toast({
          title: "Mise à jour réussie",
          description: `${updatedCount} mis à jour, ${insertedCount} nouveau(x).`,
        });
      }

      setImportDone(true);
      loadProducers();
    } catch (err: any) {
      (console.error(err), toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" }));
    } finally {
      setImporting(false);
    }
  }

  // Export cooperative select for update dialog
  const [exportCoopForUpdate, setExportCoopForUpdate] = useState("all");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Registre des producteurs</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={downloadImportTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Modèle Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => openImportDialog("insert")}>
            <Upload className="h-4 w-4 mr-2" />
            Importer
          </Button>
          <Button variant="outline" size="sm" onClick={() => openImportDialog("update")}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Mettre à jour
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExportProducers(coopFilter)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Exporter
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <ShieldOff className="h-4 w-4 mr-2" />
                Gérer sections
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>Activer / Désactiver des sections</DialogTitle>
                <DialogDescription>Les sections désactivées seront exclues de la création de chargements.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {sections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune section trouvée</p>
                ) : (
                  sections.map(([name, coop]) => (
                    <div key={name} className="flex items-center justify-between rounded-md border p-2">
                      <div>
                        <p className="text-sm font-medium">{name}</p>
                        <p className="text-xs text-muted-foreground">{coop}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{disabledSections.has(name) ? "Inactive" : "Active"}</span>
                        <Switch
                          checked={!disabledSections.has(name)}
                          onCheckedChange={() => toggleSection(name, coop)}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-60">
          <Select value={coopFilter} onValueChange={setCoopFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Toutes les coopératives" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les coopératives</SelectItem>
              {cooperatives.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, code, section..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filtered.length} producteur(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement...</p>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Statut</TableHead>
                    <SortableHeader column="full_name" label="Nom complet" sortConfig={sortConfig} onToggle={toggleSort} />
                    <SortableHeader column="sexe" label="Sexe" sortConfig={sortConfig} onToggle={toggleSort} />
                    <SortableHeader column="section" label="Section" sortConfig={sortConfig} onToggle={toggleSort} />
                    <SortableHeader column="plantation_code" label="Code plantation" sortConfig={sortConfig} onToggle={toggleSort} />
                    <SortableHeader column="delivery_potential" label="Potentiel initial (kg)" sortConfig={sortConfig} onToggle={toggleSort} />
                    <SortableHeader column="remaining_potential" label="Potentiel restant (kg)" sortConfig={sortConfig} onToggle={toggleSort} />
                    <SortableHeader column="cooperative" label="Coopérative" sortConfig={sortConfig} onToggle={toggleSort} />
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        Aucun producteur trouvé
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((p) => (
                      <TableRow key={p.id} className={p.is_active === false || disabledSections.has(p.section) ? "opacity-50" : ""}>
                        <TableCell>
                          {p.is_active === false ? (
                            <Badge variant="destructive" className="text-xs">Inactif</Badge>
                          ) : disabledSections.has(p.section) ? (
                            <Badge variant="secondary" className="text-xs">Section off</Badge>
                          ) : (
                            <Badge variant="default" className="text-xs bg-green-600">Actif</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{p.full_name}</TableCell>
                        <TableCell>{p.sexe || "—"}</TableCell>
                        <TableCell>{p.section}</TableCell>
                        <TableCell className="font-mono text-xs">{p.plantation_code}</TableCell>
                        <TableCell>{Number(p.delivery_potential).toLocaleString("fr-FR")}</TableCell>
                        <TableCell>{Number(p.remaining_potential).toLocaleString("fr-FR")}</TableCell>
                        <TableCell>{p.cooperative}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => setDetailProducer(p)} title="Détails">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Modifier">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteProducer(p)} title="Supprimer" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import / Update Dialog */}
      <Dialog open={!!importMode} onOpenChange={() => setImportMode(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {importMode === "insert" ? "Importer des producteurs" : "Mettre à jour les producteurs"}
            </DialogTitle>
            <DialogDescription>
              {importMode === "insert"
                ? "Ajoutez de nouveaux producteurs depuis un fichier Excel. Les codes plantation existants seront ignorés."
                : "Téléversez un fichier Excel pour mettre à jour les données. Les producteurs avec un code plantation existant seront écrasés par les nouvelles données."}
            </DialogDescription>
          </DialogHeader>

          {/* Export existing data before update */}
          {importMode === "update" && producers.length > 0 && (
            <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
              <p className="text-sm font-medium">📥 Exporter les données actuelles avant la mise à jour</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={exportCoopForUpdate} onValueChange={setExportCoopForUpdate}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Toutes les coopératives" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les coopératives</SelectItem>
                    {cooperatives.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => handleExportProducers(exportCoopForUpdate)}>
                  <Download className="h-4 w-4 mr-2" />
                  Exporter
                </Button>
              </div>
            </div>
          )}

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-2">
              Glissez-déposez un fichier Excel ici, ou
            </p>
            <label>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={onFileSelect} className="hidden" />
              <Button variant="outline" size="sm" asChild>
                <span className="cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Sélectionner un fichier
                </span>
              </Button>
            </label>
            {importFile && <p className="mt-2 text-sm font-medium">{importFile.name}</p>}
          </div>

          {/* Errors */}
          {importErrors.length > 0 && (
            <div className="border border-destructive rounded-lg p-3">
              <p className="text-sm font-medium text-destructive flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4" />
                {importErrors.length} erreur(s) détectée(s)
              </p>
              <div className="max-h-32 overflow-auto space-y-1">
                {importErrors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive">
                    Ligne {e.row} : {e.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {parsedRows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-accent" />
                  <strong>{parsedRows.length}</strong> producteur(s) prêt(s)
                </p>
                <Button onClick={confirmImport} disabled={importing || importDone} size="sm">
                  {importing ? "Traitement..." : importDone ? "Terminé ✓" : importMode === "insert" ? "Confirmer l'importation" : "Confirmer la mise à jour"}
                </Button>
              </div>
              <div className="max-h-60 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom complet</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Code plantation</TableHead>
                      <TableHead>Potentiel (kg)</TableHead>
                      <TableHead>Coopérative</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 100).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.full_name}</TableCell>
                        <TableCell>{r.section}</TableCell>
                        <TableCell className="font-mono text-xs">{r.plantation_code}</TableCell>
                        <TableCell>{r.delivery_potential.toLocaleString("fr-FR")}</TableCell>
                        <TableCell>{r.cooperative}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedRows.length > 100 && (
                  <p className="text-xs text-muted-foreground mt-1 text-center">
                    ... et {parsedRows.length - 100} autres lignes
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailProducer} onOpenChange={() => setDetailProducer(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Détails du producteur</DialogTitle>
            <DialogDescription>Informations complètes du producteur</DialogDescription>
          </DialogHeader>
          {detailProducer && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Nom :</span> <strong>{detailProducer.full_name}</strong></div>
              <div><span className="text-muted-foreground">Sexe :</span> <strong>{detailProducer.sexe || "—"}</strong></div>
              <div><span className="text-muted-foreground">Section :</span> <strong>{detailProducer.section}</strong></div>
              <div><span className="text-muted-foreground">Coopérative :</span> <strong>{detailProducer.cooperative}</strong></div>
              <div><span className="text-muted-foreground">Code plantation :</span> <strong className="font-mono">{detailProducer.plantation_code}</strong></div>
              <div><span className="text-muted-foreground">Code producteur :</span> <strong>{detailProducer.producer_code || "—"}</strong></div>
              <div><span className="text-muted-foreground">N° producteur :</span> <strong>{detailProducer.producer_number || "—"}</strong></div>
              <div><span className="text-muted-foreground">CNI :</span> <strong>{detailProducer.national_id || "—"}</strong></div>
              <div><span className="text-muted-foreground">Potentiel initial :</span> <strong>{Number(detailProducer.delivery_potential).toLocaleString("fr-FR")} kg</strong></div>
              <div><span className="text-muted-foreground">Potentiel restant :</span> <strong>{Number(detailProducer.remaining_potential).toLocaleString("fr-FR")} kg</strong></div>
              <div><span className="text-muted-foreground">Surface cacao :</span> <strong>{detailProducer.total_cocoa_area || "—"}</strong></div>
              <div><span className="text-muted-foreground">Nb parcelles :</span> <strong>{detailProducer.num_plots || "—"}</strong></div>
              <div><span className="text-muted-foreground">Surface plantation :</span> <strong>{detailProducer.plantation_area || "—"}</strong></div>
              <div><span className="text-muted-foreground">Latitude :</span> <strong>{detailProducer.latitude || "—"}</strong></div>
              <div><span className="text-muted-foreground">Longitude :</span> <strong>{detailProducer.longitude || "—"}</strong></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editProducer} onOpenChange={() => setEditProducer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le producteur</DialogTitle>
            <DialogDescription>Modifiez les informations du producteur</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nom complet</Label>
              <Input value={editForm.full_name || ""} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
            </div>
            <div>
              <Label>Sexe</Label>
              <Select value={editForm.sexe || ""} onValueChange={(v) => setEditForm({ ...editForm, sexe: v })}>
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Masculin</SelectItem>
                  <SelectItem value="F">Féminin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Section</Label>
              <Input value={editForm.section || ""} onChange={(e) => setEditForm({ ...editForm, section: e.target.value })} />
            </div>
            <div>
              <Label>Coopérative</Label>
              <Input value={editForm.cooperative || ""} onChange={(e) => setEditForm({ ...editForm, cooperative: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Potentiel initial (kg)</Label>
                <Input type="number" value={editForm.delivery_potential || 0} onChange={(e) => setEditForm({ ...editForm, delivery_potential: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Potentiel restant (kg)</Label>
                <Input type="number" value={editForm.remaining_potential || 0} onChange={(e) => setEditForm({ ...editForm, remaining_potential: Number(e.target.value) })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Producteur actif</Label>
              <Switch
                checked={editForm.is_active !== false}
                onCheckedChange={(checked) => setEditForm({ ...editForm, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProducer(null)}>Annuler</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "Enregistrement..." : "Enregistrer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteProducer} onOpenChange={() => setDeleteProducer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le producteur</DialogTitle>
            <DialogDescription>Cette action est irréversible.</DialogDescription>
          </DialogHeader>
          <p className="text-sm">Voulez-vous vraiment supprimer <strong>{deleteProducer?.full_name}</strong> ?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProducer(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>{saving ? "Suppression..." : "Supprimer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
