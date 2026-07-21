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
import { Search, Eye, Pencil, Trash2, Upload, RefreshCw, Download, FileSpreadsheet, CheckCircle, AlertCircle, ShieldOff, Users } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useSortableTable, SortableHeader } from "@/hooks/useSortableTable";
import { toast } from "@/hooks/use-toast";
import { parseExcelFile, downloadImportTemplate, exportToExcel, type ProducerRow, type ImportError } from "@/lib/excel-utils";
import { useActiveRegistre } from "@/hooks/useActiveRegistre";

type ImportMode = "insert" | "update";

export default function Producers() {
  const { active: activeRegistre } = useActiveRegistre();
  const registreId = activeRegistre?.id ?? null;

  const [producers, setProducers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailProducer, setDetailProducer] = useState<any | null>(null);
  const [editProducer, setEditProducer] = useState<any | null>(null);
  const [deleteProducer, setDeleteProducer] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const [importMode, setImportMode] = useState<ImportMode | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ProducerRow[]>([]);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => { loadProducers(); loadDisabledSections(); }, [registreId]);

  async function loadProducers() {
    if (!registreId) { setProducers([]); setLoading(false); return; }
    setLoading(true);
    let all: any[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await (supabase.from as any)("producers")
        .select("*")
        .eq("registre_id", registreId)
        .order("section", { ascending: true })
        .order("full_name", { ascending: true })
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    setProducers(all);
    setLoading(false);
  }

  const { sortConfig, toggleSort, sortData } = useSortableTable();

  const filtered = useMemo(() => {
    const base = producers.filter((p) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        p.full_name?.toLowerCase().includes(s) ||
        p.plantation_code?.toLowerCase().includes(s) ||
        p.section?.toLowerCase().includes(s)
      );
    });
    return sortData(base, (item: any, col: string) => {
      if (col === "delivery_potential" || col === "remaining_potential") return Number(item[col]);
      return item[col];
    });
  }, [producers, search, sortConfig]);

  const [disabledSections, setDisabledSections] = useState<Set<string>>(new Set());

  async function loadDisabledSections() {
    if (!registreId) { setDisabledSections(new Set()); return; }
    const { data } = await (supabase.from as any)("disabled_sections")
      .select("section_name")
      .eq("registre_id", registreId);
    setDisabledSections(new Set((data || []).map((d: any) => d.section_name)));
  }

  async function toggleSection(sectionName: string) {
    if (!registreId) return;
    if (disabledSections.has(sectionName)) {
      await (supabase.from as any)("disabled_sections").delete().eq("section_name", sectionName).eq("registre_id", registreId);
      toast({ title: `Section "${sectionName}" réactivée` });
    } else {
      await (supabase.from as any)("disabled_sections").insert({ section_name: sectionName, registre_id: registreId });
      toast({ title: `Section "${sectionName}" désactivée` });
    }
    loadDisabledSections();
  }

  const sections = useMemo(() => {
    const set = new Set<string>();
    producers.forEach((p) => { if (p.section) set.add(p.section); });
    return Array.from(set).sort();
  }, [producers]);

  function openEdit(p: any) {
    setEditForm({
      full_name: p.full_name,
      section: p.section,
      plantation_code: p.plantation_code,
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
    const { error } = await (supabase.from as any)("producers").update(editForm).eq("id", editProducer.id);
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
    const { error } = await (supabase.from as any)("producers").delete().eq("id", deleteProducer.id);
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

  async function handleExportProducers() {
    if (producers.length === 0) {
      toast({ title: "Aucune donnée à exporter", variant: "destructive" });
      return;
    }
    const rows = producers.map((p) => ({
      "Registre": activeRegistre?.name || "",
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
      "Nombre d'hommes": p.num_men || 0,
      "Nombre de femmes": p.num_women || 0,
    }));
    await exportToExcel(rows, `Registre-Producteurs-${activeRegistre?.name || "export"}.xlsx`, "Producteurs");
    toast({ title: "Export réussi" });
  }

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

  async function confirmImport() {
    if (parsedRows.length === 0 || !registreId) {
      toast({ title: "Sélectionnez un registre actif", variant: "destructive" });
      return;
    }
    setImporting(true);

    try {
      if (importMode === "insert") {
        const allCodes = parsedRows.map((r) => r.plantation_code);
        const existingCodes = new Set<string>();
        for (let i = 0; i < allCodes.length; i += 500) {
          const chunk = allCodes.slice(i, i + 500);
          const { data } = await (supabase.from as any)("producers")
            .select("plantation_code").eq("registre_id", registreId).in("plantation_code", chunk);
          (data || []).forEach((p: any) => existingCodes.add(p.plantation_code));
        }

        const newRows = parsedRows.filter((r) => !existingCodes.has(r.plantation_code));
        const skipped = parsedRows.length - newRows.length;
        if (skipped > 0) toast({ title: `${skipped} producteur(s) ignoré(s)`, description: "Code plantation déjà existant." });

        if (newRows.length > 0) {
          const toInsert = newRows.map((r) => ({
            ...r,
            registre_id: registreId,
            remaining_potential: r.delivery_potential,
            sexe: r.sexe || null,
            num_men: r.num_men || 0,
            num_women: r.num_women || 0,
          }));
          // strip legacy 'cooperative' field if present
          toInsert.forEach((r: any) => { delete r.cooperative; });
          for (let i = 0; i < toInsert.length; i += 500) {
            const { error } = await (supabase.from as any)("producers").insert(toInsert.slice(i, i + 500));
            if (error) throw error;
          }
          toast({ title: "Importation réussie", description: `${newRows.length} producteur(s) ajouté(s).` });
        }
      } else {
        const allCodes = parsedRows.map((r) => r.plantation_code);
        const existingMap = new Map<string, any>();
        for (let i = 0; i < allCodes.length; i += 500) {
          const chunk = allCodes.slice(i, i + 500);
          const { data } = await (supabase.from as any)("producers")
            .select("id, plantation_code").eq("registre_id", registreId).in("plantation_code", chunk);
          (data || []).forEach((p: any) => existingMap.set(p.plantation_code, p.id));
        }

        let updatedCount = 0, insertedCount = 0;
        for (const r of parsedRows) {
          const existingId = existingMap.get(r.plantation_code);
          const payload: any = {
            registre_id: registreId,
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
            num_men: r.num_men || 0,
            num_women: r.num_women || 0,
          };
          if (existingId) {
            const { error } = await (supabase.from as any)("producers").update(payload).eq("id", existingId);
            if (error) throw error;
            updatedCount++;
          } else {
            const { error } = await (supabase.from as any)("producers").insert({ ...payload, plantation_code: r.plantation_code });
            if (error) throw error;
            insertedCount++;
          }
        }
        toast({ title: "Mise à jour réussie", description: `${updatedCount} mis à jour, ${insertedCount} nouveau(x).` });
      }

      setImportDone(true);
      loadProducers();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={Users}
        title="Registre des producteurs"
        description={activeRegistre ? `Registre : ${activeRegistre.name}` : "Sélectionnez un registre actif dans l'en-tête."}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={downloadImportTemplate}>
              <Download className="h-4 w-4 mr-2" /> Modèle Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => openImportDialog("insert")} disabled={!registreId}>
              <Upload className="h-4 w-4 mr-2" /> Importer
            </Button>
            <Button variant="outline" size="sm" onClick={() => openImportDialog("update")} disabled={!registreId}>
              <RefreshCw className="h-4 w-4 mr-2" /> Mettre à jour
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportProducers} disabled={!registreId}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Exporter
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={!registreId}>
                  <ShieldOff className="h-4 w-4 mr-2" /> Gérer sections
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Activer / Désactiver des sections</DialogTitle>
                  <DialogDescription>Les sections désactivées seront exclues de la création de chargements.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  {sections.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune section</p>
                  ) : sections.map((name) => (
                    <div key={name} className="flex items-center justify-between rounded-md border p-2">
                      <p className="text-sm font-medium">{name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{disabledSections.has(name) ? "Inactive" : "Active"}</span>
                        <Switch checked={!disabledSections.has(name)} onCheckedChange={() => toggleSection(name)} />
                      </div>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher par nom, code, section..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{filtered.length} producteur(s)</CardTitle></CardHeader>
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
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Aucun producteur</TableCell></TableRow>
                  ) : filtered.map((p) => (
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
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setDetailProducer(p)} title="Détails"><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Modifier"><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteProducer(p)} title="Supprimer" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!importMode} onOpenChange={() => setImportMode(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{importMode === "insert" ? "Importer des producteurs" : "Mettre à jour les producteurs"}</DialogTitle>
            <DialogDescription>
              Registre cible : <strong>{activeRegistre?.name || "—"}</strong>
            </DialogDescription>
          </DialogHeader>

          {importMode === "update" && producers.length > 0 && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <Button variant="outline" size="sm" onClick={handleExportProducers}>
                <Download className="h-4 w-4 mr-2" /> Exporter les données actuelles
              </Button>
            </div>
          )}

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-2">Glissez-déposez un fichier Excel, ou</p>
            <label>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={onFileSelect} className="hidden" />
              <Button variant="outline" size="sm" asChild>
                <span className="cursor-pointer"><FileSpreadsheet className="h-4 w-4 mr-2" /> Sélectionner un fichier</span>
              </Button>
            </label>
            {importFile && <p className="mt-2 text-sm font-medium">{importFile.name}</p>}
          </div>

          {importErrors.length > 0 && (
            <div className="border border-destructive rounded-lg p-3">
              <p className="text-sm font-medium text-destructive flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4" /> {importErrors.length} erreur(s)
              </p>
              <div className="max-h-32 overflow-auto space-y-1">
                {importErrors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive">Ligne {e.row} : {e.message}</p>
                ))}
              </div>
            </div>
          )}

          {parsedRows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-accent" />
                  <strong>{parsedRows.length}</strong> producteur(s) prêt(s)
                </p>
                <Button onClick={confirmImport} disabled={importing || importDone} size="sm">
                  {importing ? "Traitement..." : importDone ? "Terminé ✓" : "Confirmer"}
                </Button>
              </div>
              <div className="max-h-60 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Code plantation</TableHead>
                      <TableHead>Potentiel (kg)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 100).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.full_name}</TableCell>
                        <TableCell>{r.section}</TableCell>
                        <TableCell className="font-mono text-xs">{r.plantation_code}</TableCell>
                        <TableCell>{r.delivery_potential.toLocaleString("fr-FR")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedRows.length > 100 && (
                  <p className="text-xs text-muted-foreground mt-1 text-center">... et {parsedRows.length - 100} autres lignes</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailProducer} onOpenChange={() => setDetailProducer(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Détails</DialogTitle></DialogHeader>
          {detailProducer && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Nom :</span> <strong>{detailProducer.full_name}</strong></div>
              <div><span className="text-muted-foreground">Sexe :</span> <strong>{detailProducer.sexe || "—"}</strong></div>
              <div><span className="text-muted-foreground">Section :</span> <strong>{detailProducer.section}</strong></div>
              <div><span className="text-muted-foreground">Code plantation :</span> <strong className="font-mono">{detailProducer.plantation_code}</strong></div>
              <div><span className="text-muted-foreground">Code producteur :</span> <strong>{detailProducer.producer_code || "—"}</strong></div>
              <div><span className="text-muted-foreground">Potentiel initial :</span> <strong>{Number(detailProducer.delivery_potential).toLocaleString("fr-FR")} kg</strong></div>
              <div><span className="text-muted-foreground">Potentiel restant :</span> <strong>{Number(detailProducer.remaining_potential).toLocaleString("fr-FR")} kg</strong></div>
              <div><span className="text-muted-foreground">Surface cacao :</span> <strong>{detailProducer.total_cocoa_area || "—"}</strong></div>
              <div><span className="text-muted-foreground">Latitude :</span> <strong>{detailProducer.latitude || "—"}</strong></div>
              <div><span className="text-muted-foreground">Longitude :</span> <strong>{detailProducer.longitude || "—"}</strong></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editProducer} onOpenChange={() => setEditProducer(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le producteur</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom complet</Label><Input value={editForm.full_name || ""} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} /></div>
            <div><Label>Sexe</Label>
              <Select value={editForm.sexe || ""} onValueChange={(v) => setEditForm({ ...editForm, sexe: v })}>
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent><SelectItem value="M">Masculin</SelectItem><SelectItem value="F">Féminin</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Section</Label><Input value={editForm.section || ""} onChange={(e) => setEditForm({ ...editForm, section: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Potentiel initial (kg)</Label><Input type="number" value={editForm.delivery_potential || 0} onChange={(e) => setEditForm({ ...editForm, delivery_potential: Number(e.target.value) })} /></div>
              <div><Label>Potentiel restant (kg)</Label><Input type="number" value={editForm.remaining_potential || 0} onChange={(e) => setEditForm({ ...editForm, remaining_potential: Number(e.target.value) })} /></div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Producteur actif</Label>
              <Switch checked={editForm.is_active !== false} onCheckedChange={(checked) => setEditForm({ ...editForm, is_active: checked })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProducer(null)}>Annuler</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "Enregistrement..." : "Enregistrer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteProducer} onOpenChange={() => setDeleteProducer(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Supprimer le producteur</DialogTitle></DialogHeader>
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
