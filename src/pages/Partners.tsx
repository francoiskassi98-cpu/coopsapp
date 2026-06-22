import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Handshake, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Partner = {
  id: string;
  name: string;
  contact: string | null;
  logo_url: string | null;
  status: string;
  cooperative_id: string | null;
};

type Coop = { id: string; name: string };

export default function Partners() {
  const [items, setItems] = useState<Partner[]>([]);
  const [coops, setCoops] = useState<Coop[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contact: "",
    logo_url: "",
    status: "actif",
    cooperative_id: "",
  });

  const load = async () => {
    setLoading(true);
    const [{ data: p, error: e1 }, { data: c }] = await Promise.all([
      supabase.from("partners").select("*").is("deleted_at", null).order("name"),
      supabase.from("cooperatives").select("id,name").is("deleted_at", null).order("name"),
    ]);
    if (e1) {
      console.error(e1);
      toast.error("Une erreur est survenue.");
    }
    setItems((p as Partner[]) || []);
    setCoops((c as Coop[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setEditing(null);
    setForm({ name: "", contact: "", logo_url: "", status: "actif", cooperative_id: "" });
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (p: Partner) => {
    setEditing(p);
    setForm({
      name: p.name,
      contact: p.contact ?? "",
      logo_url: p.logo_url ?? "",
      status: p.status ?? "actif",
      cooperative_id: p.cooperative_id ?? "",
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Le nom est requis.");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contact: form.contact.trim() || null,
      logo_url: form.logo_url.trim() || null,
      status: form.status,
      cooperative_id: form.cooperative_id || null,
    };
    const { error } = editing
      ? await supabase.from("partners").update(payload).eq("id", editing.id)
      : await supabase.from("partners").insert(payload);
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error("Une erreur est survenue.");
      return;
    }
    toast.success(editing ? "Partenaire mis à jour." : "Partenaire créé.");
    setOpen(false);
    resetForm();
    load();
  };

  const remove = async (p: Partner) => {
    if (!confirm(`Supprimer "${p.name}" ?`)) return;
    const { error } = await supabase
      .from("partners")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) {
      console.error(error);
      toast.error("Une erreur est survenue.");
      return;
    }
    toast.success("Partenaire supprimé.");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Handshake className="h-6 w-6 text-primary" /> Partenaires
          </h1>
          <p className="text-sm text-muted-foreground">
            Acheteurs, exportateurs et partenaires commerciaux.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Nouveau partenaire
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucun partenaire pour le moment.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                  {p.logo_url ? (
                    <img src={p.logo_url} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <Handshake className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base truncate">{p.name}</CardTitle>
                  <Badge variant={p.status === "actif" ? "default" : "secondary"} className="mt-1">
                    {p.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {p.contact && (
                  <p className="text-sm text-muted-foreground truncate">{p.contact}</p>
                )}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4 mr-1" /> Éditer
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(p)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le partenaire" : "Nouveau partenaire"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Contact</Label>
              <Input
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                placeholder="Email, téléphone…"
              />
            </div>
            <div className="space-y-2">
              <Label>URL du logo</Label>
              <Input
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                placeholder="https://…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Statut</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actif">Actif</SelectItem>
                    <SelectItem value="inactif">Inactif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Coopérative</Label>
                <Select
                  value={form.cooperative_id || "none"}
                  onValueChange={(v) => setForm({ ...form, cooperative_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    {coops.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
