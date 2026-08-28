import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderKanban, Plus, Pencil, Trash2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";

const ALL = "__all__";

interface Coop { id: string; name: string; acronym: string | null }
interface Project {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  cooperative_id: string;
  created_at: string;
}

const emptyForm = { name: "", code: "", description: "", is_active: true, cooperative_id: "" };

export default function ProjectsManagement() {
  const [coops, setCoops] = useState<Coop[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCoop, setFilterCoop] = useState<string>(ALL);
  const [filterStatus, setFilterStatus] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Project | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: c, error: ce }, { data: p, error: pe }] = await Promise.all([
      supabase.from("cooperatives").select("id,name,acronym").is("deleted_at", null).order("name"),
      supabase.from("projects").select("id,name,code,description,is_active,cooperative_id,created_at").order("name"),
    ]);
    if (ce) console.error("[ProjectsManagement] coops", ce);
    if (pe) console.error("[ProjectsManagement] projects", pe);
    setCoops(c ?? []);
    setProjects(p ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const coopLabel = (id: string) => {
    const c = coops.find((x) => x.id === id);
    if (!c) return "—";
    return c.acronym ? `${c.acronym} — ${c.name}` : c.name;
  };

  const filtered = useMemo(() => projects.filter((p) => {
    if (filterCoop !== ALL && p.cooperative_id !== filterCoop) return false;
    if (filterStatus === "active" && !p.is_active) return false;
    if (filterStatus === "inactive" && p.is_active) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${p.name} ${p.code ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  }), [projects, filterCoop, filterStatus, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, cooperative_id: filterCoop !== ALL ? filterCoop : "" });
    setOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    setForm({
      name: p.name,
      code: p.code ?? "",
      description: p.description ?? "",
      is_active: p.is_active,
      cooperative_id: p.cooperative_id,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.cooperative_id) { toast.error("La coopérative est obligatoire."); return; }
    if (!form.name.trim()) { toast.error("Le nom du projet est obligatoire."); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      description: form.description.trim() || null,
      is_active: form.is_active,
      cooperative_id: form.cooperative_id,
    };
    const { error } = editing
      ? await supabase.from("projects").update(payload).eq("id", editing.id)
      : await supabase.from("projects").insert(payload);
    setSaving(false);
    if (error) {
      console.error("[ProjectsManagement] save", error);
      toast.error("Une erreur est survenue.");
      return;
    }
    toast.success(editing ? "Projet mis à jour." : "Projet créé.");
    setOpen(false);
    load();
  };

  const remove = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("projects").delete().eq("id", toDelete.id);
    if (error) {
      console.error("[ProjectsManagement] delete", error);
      toast.error("Une erreur est survenue.");
    } else {
      toast.success("Projet supprimé.");
      load();
    }
    setToDelete(null);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={FolderKanban}
        title="Gestion des projets"
        description="Vision globale des projets par coopérative (super administrateur)."
        actions={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Nouveau projet</Button>}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtres</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
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
          <div className="space-y-1.5">
            <Label>Statut</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous les statuts</SelectItem>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="inactive">Inactif</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Recherche</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Nom ou code du projet" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Projets ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucun projet ne correspond aux filtres.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Projet</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Coopérative</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.name}
                        {p.description && <div className="text-xs text-muted-foreground line-clamp-1">{p.description}</div>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.code || "—"}</TableCell>
                      <TableCell><Badge variant="outline">{coopLabel(p.cooperative_id)}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Actif" : "Inactif"}</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p)} aria-label="Modifier">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setToDelete(p)} aria-label="Supprimer">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le projet" : "Nouveau projet"}</DialogTitle>
            <DialogDescription>Le projet appartient à une coopérative et est partagé par tous ses registres.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Coopérative *</Label>
              <Select value={form.cooperative_id} onValueChange={(v) => setForm((f) => ({ ...f, cooperative_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Sélectionner une coopérative" /></SelectTrigger>
                <SelectContent>
                  {coops.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.acronym ? `${c.acronym} — ${c.name}` : c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nom du projet *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Code projet</Label>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select value={form.is_active ? "active" : "inactive"} onValueChange={(v) => setForm((f) => ({ ...f, is_active: v === "active" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Actif</SelectItem>
                  <SelectItem value="inactive">Inactif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce projet ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le projet « {toDelete?.name} » sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
