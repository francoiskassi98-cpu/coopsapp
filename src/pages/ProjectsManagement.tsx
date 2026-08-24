import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, FolderKanban, Plus, Pencil } from "lucide-react";
import PageHeader from "@/components/PageHeader";

interface Cooperative { id: string; name: string; acronym: string | null }

interface ProjectRow {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  cooperative_id: string;
  created_at: string;
}

const ALL = "__all__";

export default function ProjectsManagement() {
  const [coops, setCoops] = useState<Cooperative[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCoop, setFilterCoop] = useState<string>(ALL);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [fCoop, setFCoop] = useState("");
  const [fName, setFName] = useState("");
  const [fCode, setFCode] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fActive, setFActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: coopRows }, { data: projRows, error }] = await Promise.all([
        supabase.from("cooperatives").select("id, name, acronym").is("deleted_at", null).order("name"),
        supabase.from("projects").select("id, name, code, description, is_active, cooperative_id, created_at").order("name"),
      ]);
      if (error) throw error;
      setCoops(coopRows ?? []);
      setProjects(projRows ?? []);
    } catch (e) {
      console.error("[ProjectsManagement] load", e);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const coopLabel = useCallback(
    (id: string) => {
      const c = coops.find((x) => x.id === id);
      return c ? (c.acronym || c.name) : "—";
    },
    [coops],
  );

  const visible = useMemo(
    () => (filterCoop === ALL ? projects : projects.filter((p) => p.cooperative_id === filterCoop)),
    [projects, filterCoop],
  );

  const openCreate = () => {
    setEditing(null);
    setFCoop(filterCoop === ALL ? "" : filterCoop);
    setFName(""); setFCode(""); setFDesc(""); setFActive(true);
    setDialogOpen(true);
  };

  const openEdit = (p: ProjectRow) => {
    setEditing(p);
    setFCoop(p.cooperative_id);
    setFName(p.name); setFCode(p.code ?? ""); setFDesc(p.description ?? ""); setFActive(p.is_active);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!fCoop) {
      toast({ title: "Coopérative requise", description: "Sélectionnez la coopérative du projet.", variant: "destructive" });
      return;
    }
    if (!fName.trim()) {
      toast({ title: "Nom requis", description: "Saisissez le nom du projet.", variant: "destructive" });
      return;
    }
    const duplicate = projects.some(
      (p) => p.cooperative_id === fCoop && p.id !== editing?.id &&
        p.name.trim().toLowerCase() === fName.trim().toLowerCase(),
    );
    if (duplicate) {
      toast({ title: "Projet existant", description: "Un projet portant ce nom existe déjà pour cette coopérative.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        cooperative_id: fCoop,
        name: fName.trim(),
        code: fCode.trim() || null,
        description: fDesc.trim() || null,
        is_active: fActive,
      };
      const { error } = editing
        ? await supabase.from("projects").update(payload).eq("id", editing.id)
        : await supabase.from("projects").insert(payload);
      if (error) throw error;
      toast({ title: editing ? "Projet modifié" : "Projet créé", description: payload.name });
      setDialogOpen(false);
      if (!editing) setFilterCoop(fCoop);
      await load();
    } catch (e) {
      console.error("[ProjectsManagement] save", e);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={FolderKanban}
        title="Gestion des projets"
        description="Vision globale des projets par coopérative (réservé au super administrateur)"
        actions={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Nouveau projet</Button>}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-2">
            <Label>Coopérative</Label>
            <Select value={filterCoop} onValueChange={setFilterCoop}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Toutes les coopératives</SelectItem>
                {coops.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.acronym ? `${c.acronym} — ${c.name}` : c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Projets ({visible.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projet</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Coopérative</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.code || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{coopLabel(p.cooperative_id)}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{p.description || "—"}</TableCell>
                    <TableCell>
                      {p.is_active
                        ? <Badge className="bg-green-600 hover:bg-green-600/80 text-white border-transparent">Actif</Badge>
                        : <Badge variant="secondary">Inactif</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Modifier">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Aucun projet pour cette sélection.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o && !saving) setDialogOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le projet" : "Nouveau projet"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Coopérative <span className="text-destructive">*</span></Label>
              <Select value={fCoop} onValueChange={setFCoop}>
                <SelectTrigger><SelectValue placeholder="Sélectionner une coopérative" /></SelectTrigger>
                <SelectContent>
                  {coops.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.acronym ? `${c.acronym} — ${c.name}` : c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nom du projet <span className="text-destructive">*</span></Label>
              <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="ex: Projet Cacao Durable" />
            </div>
            <div className="space-y-2">
              <Label>Code projet</Label>
              <Input value={fCode} onChange={(e) => setFCode(e.target.value)} placeholder="ex: PCD-2026" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={3} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Statut</Label>
                <p className="text-xs text-muted-foreground">{fActive ? "Projet actif" : "Projet inactif"}</p>
              </div>
              <Switch checked={fActive} onCheckedChange={setFActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editing ? "Enregistrer" : "Créer le projet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
