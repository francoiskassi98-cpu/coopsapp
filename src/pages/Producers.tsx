import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Search, Eye, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function Producers() {
  const [producers, setProducers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailProducer, setDetailProducer] = useState<any | null>(null);
  const [editProducer, setEditProducer] = useState<any | null>(null);
  const [deleteProducer, setDeleteProducer] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProducers();
  }, []);

  async function loadProducers() {
    const { data } = await supabase
      .from("producers")
      .select("*")
      .order("section", { ascending: true })
      .order("full_name", { ascending: true });
    setProducers(data || []);
    setLoading(false);
  }

  const filtered = producers.filter(
    (p) =>
      !search ||
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.plantation_code.toLowerCase().includes(search.toLowerCase()) ||
      p.section.toLowerCase().includes(search.toLowerCase())
  );

  function openEdit(p: any) {
    setEditForm({
      full_name: p.full_name,
      section: p.section,
      plantation_code: p.plantation_code,
      cooperative: p.cooperative,
      sexe: p.sexe || "",
      delivery_potential: p.delivery_potential,
      remaining_potential: p.remaining_potential,
    });
    setEditProducer(p);
  }

  async function handleSaveEdit() {
    if (!editProducer) return;
    setSaving(true);
    const { error } = await supabase
      .from("producers")
      .update(editForm)
      .eq("id", editProducer.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
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
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Producteur supprimé" });
      setDeleteProducer(null);
      loadProducers();
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Registre des producteurs</h1>
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
                    <TableHead>Nom complet</TableHead>
                    <TableHead>Sexe</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Code plantation</TableHead>
                    <TableHead>Potentiel initial (kg)</TableHead>
                    <TableHead>Potentiel restant (kg)</TableHead>
                    <TableHead>Coopérative</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        Aucun producteur trouvé
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((p) => (
                      <TableRow key={p.id}>
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
