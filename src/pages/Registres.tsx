import { useEffect, useState } from "react";
import { BookOpen, Plus, Pencil, Power, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveRegistre } from "@/hooks/useActiveRegistre";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

type Registre = {
  id: string;
  cooperative_id: string;
  name: string;
  code: string | null;
  responsable: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  created_at: string;
};

type Coop = { id: string; name: string };

const empty = { name: "", code: "", responsable: "", phone: "", address: "" };

export default function Registres() {
  const { isSuperAdmin, cooperativeRefs } = useAuth();
  const { activeCoopId, refetch: refetchActive } = useActiveRegistre();
  const [coops, setCoops] = useState<Coop[]>([]);
  const [coopFilter, setCoopFilter] = useState<string>(activeCoopId ?? "");
  const [registres, setRegistres] = useState<Registre[]>([]);
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Registre | null>(null);
  const [form, setForm] = useState({ ...empty, cooperative_id: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (isSuperAdmin) {
        const { data } = await supabase.from("cooperatives").select("id, name").order("name");
        setCoops((data as Coop[]) ?? []);
      } else {
        setCoops(cooperativeRefs);
      }
    })();
  }, [isSuperAdmin, cooperativeRefs]);

  useEffect(() => {
    if (!coopFilter && coops.length > 0) setCoopFilter(coops[0].id);
  }, [coops, coopFilter]);

  const fetchList = async () => {
    if (!coopFilter) { setRegistres([]); return; }
    setLoading(true);
    const { data, error } = await (supabase.from as any)("registres")
      .select("*").eq("cooperative_id", coopFilter).order("name");
    setLoading(false);
    if (error) { console.error(error); return; }
    setRegistres((data ?? []) as Registre[]);
  };

  useEffect(() => { fetchList(); }, [coopFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...empty, cooperative_id: coopFilter });
    setOpen(true);
  };
  const openEdit = (r: Registre) => {
    setEditing(r);
    setForm({
      name: r.name,
      code: r.code ?? "",
      responsable: r.responsable ?? "",
      phone: r.phone ?? "",
      address: r.address ?? "",
      cooperative_id: r.cooperative_id,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.cooperative_id) {
      toast({ title: "Champs requis", description: "Coopérative et nom sont obligatoires.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      cooperative_id: form.cooperative_id,
      name: form.name.trim(),
      code: form.code.trim() || null,
      responsable: form.responsable.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
    };
    const { error } = editing
      ? await (supabase.from as any)("registres").update(payload).eq("id", editing.id)
      : await (supabase.from as any)("registres").insert(payload);
    setSaving(false);
    if (error) {
      console.error(error);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Registre modifié" : "Registre créé" });
    setOpen(false);
    fetchList();
    refetchActive();
  };

  const toggleStatus = async (r: Registre) => {
    const next = r.status === "active" ? "inactive" : "active";
    const { error } = await (supabase.from as any)("registres").update({ status: next }).eq("id", r.id);
    if (error) { console.error(error); toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" }); return; }
    fetchList();
    refetchActive();
  };

  const remove = async (r: Registre) => {
    if (!confirm(`Supprimer le registre "${r.name}" ? Cette action est irréversible et n'est possible que s'il ne contient aucune donnée.`)) return;
    const { error } = await (supabase.from as any)("registres").delete().eq("id", r.id);
    if (error) {
      console.error(error);
      toast({ title: "Suppression impossible", description: "Le registre contient probablement des données liées.", variant: "destructive" });
      return;
    }
    toast({ title: "Registre supprimé" });
    fetchList();
    refetchActive();
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={BookOpen}
        title="Registres"
        description="Un registre est l'unité opérationnelle de la coopérative. Toutes les données métier (producteurs, chargements, primes) y sont rattachées."
        actions={
          <Button size="sm" onClick={openCreate} disabled={!coopFilter}>
            <Plus className="h-4 w-4 mr-2" /> Nouveau registre
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Liste des registres ({registres.length})</CardTitle>
          {coops.length > 1 && (
            <div className="w-64">
              <Select value={coopFilter} onValueChange={setCoopFilter}>
                <SelectTrigger><SelectValue placeholder="Coopérative" /></SelectTrigger>
                <SelectContent>
                  {coops.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registres.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.code ?? "—"}</TableCell>
                  <TableCell>{r.responsable ?? "—"}</TableCell>
                  <TableCell>{r.phone ?? "—"}</TableCell>
                  <TableCell>
                    {r.status === "active"
                      ? <Badge variant="outline" className="border-green-500 text-green-600">Actif</Badge>
                      : <Badge variant="outline" className="border-muted-foreground text-muted-foreground">Désactivé</Badge>}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleStatus(r)}>
                      <Power className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => remove(r)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && registres.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Aucun registre. Créez-en un pour commencer.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le registre" : "Nouveau registre"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {coops.length > 1 && !editing && (
              <div>
                <Label>Coopérative *</Label>
                <Select value={form.cooperative_id} onValueChange={(v) => setForm({ ...form, cooperative_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {coops.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Nom *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex. Registre Centre" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Code</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Ex. RC-01" />
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Responsable</Label>
              <Input value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} />
            </div>
            <div>
              <Label>Adresse</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Enregistrement..." : "Enregistrer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
