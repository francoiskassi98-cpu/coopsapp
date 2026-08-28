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
import { useNavigate } from "react-router-dom";
import { Search, Eye, Pencil, Trash2, Upload, RefreshCw, Download, FileSpreadsheet, CheckCircle, AlertCircle, ShieldOff } from "lucide-react";
import { useSortableTable, SortableHeader, type SortValue } from "@/hooks/useSortableTable";
import { toast } from "@/hooks/use-toast";
import { parseExcelFile, downloadImportTemplate, exportToExcel, downloadErrorReport, type ProducerRow, type ImportError, type ImportReport } from "@/lib/excel-utils";
import PageHeader from "@/components/PageHeader";
import { Users as UsersIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { normalizeCampaign, getCurrentCampaign } from "@/lib/shipment-utils";
import { useDebounce } from "@/hooks/useDebounce";
import type { Database } from "@/integrations/supabase/types";

type ImportMode = "insert" | "update";

const ROWS_STEP = 100;


type ProducerDbRow = Database["public"]["Tables"]["producers"]["Row"];
/** Producteur enrichi du nom de son registre (exposé sous `cooperative` pour le rendu). */
type ProducerListRow = ProducerDbRow & {
  registres?: { id: string; name: string } | null;
  cooperative: string;
};
type ProducerEditForm = Partial<ProducerDbRow>;

export default function Producers() {
  const navigate = useNavigate();
  const { cooperativeRefs, isSuperAdmin } = useAuth();
  const [producers, setProducers] = useState<ProducerListRow[]>([]);
  const [search, setSearch] = useState("");
  const [coopFilter, setCoopFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [detailProducer, setDetailProducer] = useState<ProducerListRow | null>(null);
  const [editProducer, setEditProducer] = useState<ProducerListRow | null>(null);
  const [deleteProducer, setDeleteProducer] = useState<ProducerListRow | null>(null);
  const [editForm, setEditForm] = useState<ProducerEditForm>({});

  const [saving, setSaving] = useState(false);

  // Import state
  const [importMode, setImportMode] = useState<ImportMode | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ProducerRow[]>([]);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [dragOver, setDragOver] = useState(false);


  const loadProducers = useCallback(async () => {
    setLoading(true);
    type FetchedProducer = ProducerDbRow & { registres?: { id: string; name: string } | null };
    let allData: FetchedProducer[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await supabase
        .from("producers")
        .select("*, registres(id, name)")
        .order("section", { ascending: true })
        .order("full_name", { ascending: true })
        .range(from, from + PAGE - 1)
        .returns<FetchedProducer[]>();
      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    // Compat : expose le nom du registre sous `cooperative` pour tout le rendu existant
    setProducers(allData.map((p) => ({ ...p, cooperative: p.registres?.name || "" })));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProducers();
  }, [loadProducers]);


  // Unique cooperatives for filter
  const cooperatives = useMemo(() => {
    const set = new Set<string>();
    producers.forEach((p) => {
      if (p.cooperative) set.add(p.cooperative);
    });
    return Array.from(set).sort();
  }, [producers]);

  const { sortConfig, toggleSort, sortData } = useSortableTable();
  const debouncedSearch = useDebounce(search, 250);
  const [visibleCount, setVisibleCount] = useState(ROWS_STEP);

  const filtered = useMemo(() => {
    const s = debouncedSearch.trim().toLowerCase();
    const base = producers.filter((p) => {
      if (coopFilter !== "all" && p.cooperative !== coopFilter) return false;
      if (!s) return true;
      return (
        p.full_name.toLowerCase().includes(s) ||
        p.plantation_code.toLowerCase().includes(s) ||
        p.section.toLowerCase().includes(s)
      );
    });
    return sortData(base, (item, col): SortValue => {
      if (col === "delivery_potential" || col === "remaining_potential") return Number(item[col]);
      const v: unknown = (item as Record<string, unknown>)[col];
      if (v == null) return null;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
      return String(v);
    });
  }, [producers, coopFilter, debouncedSearch, sortData]);

  // Rendu progressif : on n'affiche qu'un lot de lignes à la fois pour rester fluide
  useEffect(() => {
    setVisibleCount(ROWS_STEP);
  }, [debouncedSearch, coopFilter, sortConfig]);

  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);


  // --- Edit / Delete (existing) ---
  // Sections désactivées (clé = registre_id||section, campagne active)
  const activeCampaign = normalizeCampaign(getCurrentCampaign());
  const [disabledSections, setDisabledSections] = useState<Set<string>>(new Set());
  const [togglingSections, setTogglingSections] = useState<Set<string>>(new Set());
  const sectionKey = (registreId: string, name: string) => `${registreId}||${name}`;

  const loadDisabledSections = useCallback(async () => {
    const { data, error } = await supabase
      .from("disabled_sections")
      .select("section_name, registre_id")
      .eq("campaign_label", activeCampaign);
    if (error) {
      console.error("[disabled_sections] load", error);
      return;
    }
    setDisabledSections(new Set((data ?? []).map((d) => sectionKey(d.registre_id, d.section_name))));
  }, [activeCampaign]);

  useEffect(() => {
    loadDisabledSections();
  }, [loadDisabledSections]);

  async function toggleSection(sectionName: string, registreId?: string) {
    if (!registreId) {
      toast({ title: "Erreur", description: "Registre introuvable pour cette section.", variant: "destructive" });
      return;
    }
    const key = sectionKey(registreId, sectionName);
    if (togglingSections.has(key)) return;
    const isDisabled = disabledSections.has(key);
    setTogglingSections((current) => new Set(current).add(key));
    const { error } = isDisabled
      ? await supabase
          .from("disabled_sections")
          .delete()
          .eq("section_name", sectionName)
          .eq("registre_id", registreId)
          .eq("campaign_label", activeCampaign)
      : await supabase
          .from("disabled_sections")
          .insert({ section_name: sectionName, registre_id: registreId, campaign_label: activeCampaign });

    if (error) {
      console.error("[disabled_sections] toggle", error);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
      setTogglingSections((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      return;
    }
    setDisabledSections((current) => {
      const next = new Set(current);
      if (isDisabled) next.delete(key);
      else next.add(key);
      return next;
    });
    setTogglingSections((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    toast({ title: `Section "${sectionName}" ${isDisabled ? "réactivée" : "désactivée"}` });
  }

  // Sections uniques (par registre) pour le filtre courant
  const sections = useMemo(() => {
    const map = new Map<string, { name: string; registreId: string; registreName: string }>();
    producers.forEach((p) => {
      if (coopFilter === "all" || p.cooperative === coopFilter) {
        const key = sectionKey(p.registre_id, p.section);
        if (!map.has(key)) map.set(key, { name: p.section, registreId: p.registre_id, registreName: p.cooperative || "" });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.registreName.localeCompare(b.registreName) || a.name.localeCompare(b.name)
    );
  }, [producers, coopFilter]);


  function openEdit(p: ProducerListRow) {
    setEditForm({
      full_name: p.full_name,
      section: p.section,
      plantation_code: p.plantation_code,
      registre_id: p.registre_id,
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
    // Export dans le MÊME format que le modèle d'import (compat aller-retour)
    const rows = data.map((p) => ({
      "Registre": p.cooperative,
      "Campagne": p.campaign_label || "",
      "Nom et prenom du producteur": p.full_name,
      "Numero du producteur": p.producer_number || "",
      "N° identification nationale du producteur": p.national_id || "",
      "Code du producteur": p.producer_code || "",
      "Sexe": p.sexe || "",
      "Section": p.section,
      "Superficie total cacao": p.total_cocoa_area || 0,
      "Nombre de champ de cacao": p.num_plots || 0,
      "Code de la plantation": p.plantation_code,
      "Potentiel de livraison": p.delivery_potential,
      "Superficie": p.plantation_area || 0,
      "Latitude polygone": p.latitude || 0,
      "Longitude polygone": p.longitude || 0,
    }));
    const suffix = cooperative && cooperative !== "all" ? `-${cooperative}` : "";
    await exportToExcel(rows, `Registre-Producteurs${suffix}.xlsx`, "Registre");
    toast({ title: "Export réussi" });
  }

  // --- Import / Update logic ---
  function openImportDialog(mode: ImportMode) {
    setImportMode(mode);
    setImportFile(null);
    setParsedRows([]);
    setImportErrors([]);
    setImportReport(null);
    setImportDone(false);
  }

  const handleFile = useCallback(async (f: File) => {
    setImportFile(f);
    setImportDone(false);
    const buffer = await f.arrayBuffer();
    const report = await parseExcelFile(buffer);
    setParsedRows(report.rows);
    setImportErrors(report.errors);
    setImportReport(report);
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

  async function resolveRegistreIds(names: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const uniq = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
    if (uniq.length === 0) return map;

    // Fetch existing registres (RLS scopes them to accessible cooperatives)
    const { data: existing, error: fetchErr } = await supabase
      .from("registres")
      .select("id, name, cooperative_id");
    if (fetchErr) throw fetchErr;
    const byName = new Map<string, { id: string; cooperative_id: string }>();
    (existing ?? []).forEach((r) => byName.set(r.name.trim().toLowerCase(), r));

    const missing: string[] = [];
    for (const name of uniq) {
      const found = byName.get(name.toLowerCase());
      if (found) map.set(name.toLowerCase(), found.id);
      else missing.push(name);
    }

    if (missing.length > 0) {
      if (isSuperAdmin) {
        throw new Error(
          `Registre(s) introuvable(s) : ${missing.join(", ")}. En tant que super admin, créez-les d'abord depuis /gestion/coopératives.`,
        );
      }
      const coopId = cooperativeRefs[0]?.id;
      if (!coopId) {
        throw new Error(
          "Aucune coopérative associée à votre compte. Contactez le super administrateur.",
        );
      }
      const toCreate = missing.map((name) => ({
        name,
        cooperative_id: coopId,
        status: "active",
      }));
      const { data: created, error: createErr } = await supabase
        .from("registres")
        .insert(toCreate)
        .select("id, name");
      if (createErr) throw createErr;
      (created ?? []).forEach((r) => map.set(r.name.trim().toLowerCase(), r.id));
    }

    return map;
  }

  function toDbRow(r: ProducerRow, registreId: string) {
    return {
      registre_id: registreId,
      full_name: r.full_name,
      producer_number: r.producer_number || null,
      national_id: r.national_id || null,
      producer_code: r.producer_code || null,
      sexe: r.sexe || null,
      section: r.section,
      total_cocoa_area: r.total_cocoa_area || null,
      num_plots: r.num_plots || null,
      plantation_code: r.plantation_code,
      delivery_potential: r.delivery_potential || 0,
      remaining_potential: r.delivery_potential || 0,
      plantation_area: r.plantation_area || null,
      latitude: r.latitude || null,
      longitude: r.longitude || null,
      is_active: true,
    };
  }

  function describeSupabaseError(err: unknown, step: string): string {
    if (!err) return `Étape « ${step} » : erreur inconnue.`;
    const e = err as { code?: string; message?: string; details?: string; hint?: string };
    const parts: string[] = [`Étape « ${step} »`];
    if (e.code) parts.push(`code ${e.code}`);
    if (e.message) parts.push(e.message);
    if (e.details) parts.push(`détails : ${e.details}`);
    if (e.hint) parts.push(`indice : ${e.hint}`);
    return parts.join(" — ");
  }


  async function confirmImport() {
    if (parsedRows.length === 0) return;
    setImporting(true);
    let step = "préparation";

    try {
      // 1. Resolve registres by name
      step = "résolution des registres";
      const registreMap = await resolveRegistreIds(parsedRows.map((r) => r.cooperative));

      const rowsWithRegistre = parsedRows
        .map((r) => {
          const rid = registreMap.get(r.cooperative.trim().toLowerCase());
          return rid ? { row: r, registreId: rid } : null;
        })
        .filter((x): x is { row: ProducerRow; registreId: string } => !!x);

      if (rowsWithRegistre.length === 0) {
        throw new Error("Aucune ligne ne correspond à un registre accessible.");
      }

      if (importMode === "insert") {
        step = "vérification des codes plantation existants";
        const allCodes = rowsWithRegistre.map(({ row }) => row.plantation_code);
        const existingCodes = new Set<string>();
        for (let i = 0; i < allCodes.length; i += 500) {
          const chunk = allCodes.slice(i, i + 500);
          const { data, error } = await supabase
            .from("producers")
            .select("plantation_code")
            .in("plantation_code", chunk);
          if (error) throw error;
          (data ?? []).forEach((p) => existingCodes.add(p.plantation_code));
        }

        const newRows = rowsWithRegistre.filter(({ row }) => !existingCodes.has(row.plantation_code));
        const skipped = rowsWithRegistre.length - newRows.length;

        if (skipped > 0) {
          toast({
            title: `${skipped} producteur(s) ignoré(s)`,
            description: "Code plantation déjà existant.",
          });
        }

        if (newRows.length > 0) {
          step = "insertion des producteurs";
          const toInsert = newRows.map(({ row, registreId }) => toDbRow(row, registreId));
          for (let i = 0; i < toInsert.length; i += 200) {
            const batch = toInsert.slice(i, i + 200);
            const { error } = await supabase.from("producers").insert(batch as never);
            if (error) {
              (error as { __batchIndex?: number }).__batchIndex = i;
              throw error;
            }
          }
          toast({
            title: "Importation réussie",
            description: `${newRows.length} producteur(s) ajouté(s).`,
          });
        }
      } else {
        // Update mode: upsert by plantation_code
        step = "récupération des producteurs existants";
        const allCodes = rowsWithRegistre.map(({ row }) => row.plantation_code);
        const existingMap = new Map<string, string>();
        for (let i = 0; i < allCodes.length; i += 500) {
          const chunk = allCodes.slice(i, i + 500);
          const { data, error } = await supabase
            .from("producers")
            .select("id, plantation_code")
            .in("plantation_code", chunk);
          if (error) throw error;
          (data ?? []).forEach((p) => existingMap.set(p.plantation_code, p.id));
        }

        let updatedCount = 0;
        let insertedCount = 0;
        type ProducerInsert = ReturnType<typeof toDbRow>;
        const inserts: ProducerInsert[] = [];
        const updates: { id: string; payload: Omit<ProducerInsert, "registre_id"> }[] = [];

        for (const { row, registreId } of rowsWithRegistre) {
          const payload = toDbRow(row, registreId);
          const existingId = existingMap.get(row.plantation_code);
          if (existingId) {
            const { registre_id: _rid, ...rest } = payload;
            updates.push({ id: existingId, payload: rest });
            updatedCount++;
          } else {
            inserts.push(payload);
            insertedCount++;
          }
        }

        step = "mise à jour des producteurs";
        for (const u of updates) {
          const { error } = await supabase.from("producers").update(u.payload).eq("id", u.id);
          if (error) throw error;
        }

        if (inserts.length > 0) {
          step = "insertion des nouveaux producteurs";
          for (let i = 0; i < inserts.length; i += 200) {
            const batch = inserts.slice(i, i + 200);
            const { error } = await supabase.from("producers").insert(batch as never);
            if (error) throw error;
          }
        }

        toast({
          title: "Mise à jour réussie",
          description: `${updatedCount} mis à jour, ${insertedCount} nouveau(x).`,
        });
      }

      setImportDone(true);
      await loadProducers();
    } catch (err: unknown) {
      console.error("[import producers] échec:", { step, error: err });
      const detail = describeSupabaseError(err, step);
      toast({
        title: "Erreur d'importation",
        description: detail.length > 300 ? detail.slice(0, 297) + "…" : detail,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  }


  // Export cooperative select for update dialog
  const [exportCoopForUpdate, setExportCoopForUpdate] = useState("all");

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={UsersIcon}
        title="Registre des producteurs"
        description="Consulter, filtrer, importer et exporter les producteurs."
      />
      <div className="flex items-center justify-end flex-wrap gap-3">
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
                  sections.map((s) => (
                    <div key={sectionKey(s.registreId, s.name)} className="flex items-center justify-between rounded-md border p-2">
                      <div>
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.registreName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{disabledSections.has(sectionKey(s.registreId, s.name)) ? "Inactive" : "Active"}</span>
                        <Switch
                          checked={!disabledSections.has(sectionKey(s.registreId, s.name))}
                          disabled={togglingSections.has(sectionKey(s.registreId, s.name))}
                          aria-label={`${disabledSections.has(sectionKey(s.registreId, s.name)) ? "Activer" : "Désactiver"} la section ${s.name}`}
                          onCheckedChange={() => toggleSection(s.name, s.registreId)}
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
              <SelectValue placeholder="Tous les registres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les registres</SelectItem>
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
                    <SortableHeader column="cooperative" label="Registre" sortConfig={sortConfig} onToggle={toggleSort} />
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
                    visibleRows.map((p) => (
                      <TableRow key={p.id} className={p.is_active === false || disabledSections.has(sectionKey(p.registre_id, p.section)) ? "opacity-50" : ""}>
                        <TableCell>
                          {p.is_active === false ? (
                            <Badge variant="destructive" className="text-xs">Inactif</Badge>
                          ) : disabledSections.has(sectionKey(p.registre_id, p.section)) ? (
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
                            <Button variant="ghost" size="icon" onClick={() => navigate(`/producteurs/${p.id}`)} title="Fiche complète">
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
              {visibleCount < filtered.length && (
                <div className="flex justify-center py-4">
                  <Button variant="outline" size="sm" onClick={() => setVisibleCount((c) => c + ROWS_STEP)}>
                    Afficher plus ({filtered.length - visibleCount} restants)
                  </Button>
                </div>
              )}
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
                    <SelectValue placeholder="Tous les registres" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les registres</SelectItem>
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

          {/* Summary */}
          {importReport && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div className="rounded-md border p-2 text-center">
                <p className="text-xs text-muted-foreground">Total analysées</p>
                <p className="text-lg font-semibold">{importReport.totalRows}</p>
              </div>
              <div className="rounded-md border p-2 text-center bg-green-50 dark:bg-green-950/20">
                <p className="text-xs text-muted-foreground">Valides</p>
                <p className="text-lg font-semibold text-green-700 dark:text-green-400">{importReport.validRows}</p>
              </div>
              <div className="rounded-md border p-2 text-center bg-red-50 dark:bg-red-950/20">
                <p className="text-xs text-muted-foreground">Rejetées</p>
                <p className="text-lg font-semibold text-red-700 dark:text-red-400">{importReport.rejectedRows}</p>
              </div>
              <div className="rounded-md border p-2 text-center bg-amber-50 dark:bg-amber-950/20">
                <p className="text-xs text-muted-foreground">Avertissements</p>
                <p className="text-lg font-semibold text-amber-700 dark:text-amber-400">{importReport.warnings}</p>
              </div>
              <div className="rounded-md border p-2 text-center bg-red-50 dark:bg-red-950/20">
                <p className="text-xs text-muted-foreground">Bloquantes</p>
                <p className="text-lg font-semibold text-red-700 dark:text-red-400">{importReport.blockingErrors}</p>
              </div>
            </div>
          )}

          {/* No errors: success message */}
          {importReport && importErrors.length === 0 && parsedRows.length > 0 && (
            <div className="border border-green-500/40 bg-green-50 dark:bg-green-950/20 rounded-lg p-3 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <p className="text-sm text-green-700 dark:text-green-400">
                Aucune erreur détectée. Le fichier est prêt à être importé.
              </p>
            </div>
          )}

          {/* Errors — detailed report */}
          {importErrors.length > 0 && (
            <div className="border border-destructive rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {importErrors.length} erreur(s) détectée(s)
                </p>
                <Button size="sm" variant="outline" onClick={() => downloadErrorReport(importErrors)}>
                  <Download className="h-4 w-4 mr-2" />
                  Télécharger le rapport
                </Button>
              </div>
              <div className="max-h-64 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Ligne</TableHead>
                      <TableHead>Colonne</TableHead>
                      <TableHead>Valeur trouvée</TableHead>
                      <TableHead>Cause</TableHead>
                      <TableHead>Valeur attendue</TableHead>
                      <TableHead>Action recommandée</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importErrors.slice(0, 200).map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{e.row}</TableCell>
                        <TableCell className="text-xs">{e.column || "—"}</TableCell>
                        <TableCell className="text-xs font-mono max-w-32 truncate" title={e.value}>{e.value || "—"}</TableCell>
                        <TableCell className="text-xs text-destructive">{e.cause}</TableCell>
                        <TableCell className="text-xs">{e.expected || "—"}</TableCell>
                        <TableCell className="text-xs">{e.action || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {importErrors.length > 200 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    ... et {importErrors.length - 200} autres erreur(s) (télécharger le rapport pour la liste complète)
                  </p>
                )}
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
                      <TableHead>Registre</TableHead>
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
              <div><span className="text-muted-foreground">Registre :</span> <strong>{detailProducer.cooperative}</strong></div>
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
              <div><span className="text-muted-foreground">Nombre d'hommes :</span> <strong>{detailProducer.num_men ?? "—"}</strong></div>
              <div><span className="text-muted-foreground">Nombre de femmes :</span> <strong>{detailProducer.num_women ?? "—"}</strong></div>
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
              <Label>Registre</Label>
              <Input value={editProducer?.cooperative || ""} disabled readOnly />
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
