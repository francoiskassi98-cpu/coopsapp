import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Loader2, Plus, Pencil, PauseCircle, PlayCircle, Trash2, CreditCard } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ImageUploader from "@/components/ui/ImageUploader";

type Status = "trial" | "active" | "expired" | "suspended";

interface Row {
  id: string;
  name: string;
  acronym: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  phone: string | null;
  official_email: string | null;
  manager_name: string | null;
  logo_path: string | null;
  status: Status;
  plan_name: string | null;
  start_date: string | null;
  end_date: string | null;
  days_remaining: number | null;
}

const STATUS_LABEL: Record<Status, { label: string; className: string; icon: string }> = {
  active:    { label: "Actif",     className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", icon: "🟢" },
  trial:     { label: "Essai",     className: "bg-amber-500/10 text-amber-600 border-amber-500/30",     icon: "🟡" },
  expired:   { label: "Expiré",    className: "bg-rose-500/10 text-rose-600 border-rose-500/30",       icon: "🔴" },
  suspended: { label: "Suspendu",  className: "bg-slate-500/10 text-slate-500 border-slate-500/30",    icon: "⚪" },
};

export default function CooperativesManagement() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);
  const [subEdit, setSubEdit] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", acronym: "", city: "", region: "", country: "", phone: "",
    official_email: "", manager_name: "", logo_path: null as string | null,
  });
  const [subForm, setSubForm] = useState({
    plan_name: "Pilote", start_date: "", end_date: "", status: "trial" as Status,
  });

  const load = async () => {
    setLoading(true);
    const { data: coops } = await (supabase as any)
      .from("cooperatives")
      .select("id,name,acronym,city,region,country,phone,official_email,manager_name,logo_path")
      .is("deleted_at", null)
      .order("name");
    const list = (coops || []) as any[];
    const enriched = await Promise.all(list.map(async (c: any) => {
      const [{ data: sub }, { data: statusData }] = await Promise.all([
        (supabase as any).from("subscriptions")
          .select("plan_name,start_date,end_date,status")
          .eq("cooperative_id", c.id)
          .order("end_date", { ascending: false })
          .limit(1).maybeSingle(),
        (supabase as any).rpc("get_subscription_status", { _coop_id: c.id }),
      ]);
      const status: Status = (statusData as Status) ?? sub?.status ?? "trial";
      const days = sub?.end_date ? Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86_400_000)) : null;
      return { ...c, status, plan_name: sub?.plan_name ?? null, start_date: sub?.start_date ?? null, end_date: sub?.end_date ?? null, days_remaining: days } as Row;
    }));
    setRows(enriched);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (r: Row) => {
    setEditing(r);
    setEditForm({
      name: r.name, acronym: r.acronym ?? "", city: r.city ?? "", region: r.region ?? "",
      country: r.country ?? "", phone: r.phone ?? "", official_email: r.official_email ?? "",
      manager_name: r.manager_name ?? "", logo_path: r.logo_path ?? null,
    });
  };

  const submitEdit = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await (supabase as any).from("cooperatives").update(editForm).eq("id", editing.id);
    setSaving(false);
    if (error) { console.error(error); toast.error("Une erreur est survenue."); return; }
    toast.success("Coopérative mise à jour.");
    setEditing(null); load();
  };

  const openSub = (r: Row) => {
    setSubEdit(r);
    setSubForm({
      plan_name: r.plan_name ?? "Pilote",
      start_date: r.start_date ?? new Date().toISOString().slice(0, 10),
      end_date: r.end_date ?? new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString().slice(0, 10),
      status: r.status,
    });
  };

  const submitSub = async () => {
    if (!subEdit) return;
    setSaving(true);
    // Upsert la dernière souscription : on met à jour la plus récente ou on en insère une.
    const { data: existing } = await (supabase as any).from("subscriptions")
      .select("id").eq("cooperative_id", subEdit.id)
      .order("end_date", { ascending: false }).limit(1).maybeSingle();
    if (existing?.id) {
      const { error } = await (supabase as any).from("subscriptions")
        .update(subForm).eq("id", existing.id);
      if (error) { console.error(error); toast.error("Une erreur est survenue."); setSaving(false); return; }
    } else {
      const { error } = await (supabase as any).from("subscriptions")
        .insert({ ...subForm, cooperative_id: subEdit.id });
      if (error) { console.error(error); toast.error("Une erreur est survenue."); setSaving(false); return; }
    }
    setSaving(false);
    toast.success("Abonnement mis à jour.");
    setSubEdit(null); load();
  };

  const toggleSuspend = async (r: Row) => {
    const nextStatus: Status = r.status === "suspended" ? "active" : "suspended";
    const { data: existing } = await (supabase as any).from("subscriptions")
      .select("id").eq("cooperative_id", r.id)
      .order("end_date", { ascending: false }).limit(1).maybeSingle();
    if (!existing?.id) { toast.error("Aucun abonnement à modifier."); return; }
    const { error } = await (supabase as any).from("subscriptions").update({ status: nextStatus }).eq("id", existing.id);
    if (error) { console.error(error); toast.error("Une erreur est survenue."); return; }
    toast.success(nextStatus === "suspended" ? "Coopérative suspendue." : "Coopérative réactivée.");
    load();
  };

  const remove = async (r: Row) => {
    if (!confirm(`Supprimer la coopérative "${r.name}" ? Cette action est définitive si aucune donnée n'y est rattachée.`)) return;
    const [{ count: prodCount }, { count: shipCount }] = await Promise.all([
      (supabase as any).from("producers").select("id", { count: "exact", head: true }).eq("cooperative", r.name),
      (supabase as any).from("shipments").select("id", { count: "exact", head: true }).eq("cooperative_id", r.id),
    ]);
    if ((prodCount ?? 0) > 0 || (shipCount ?? 0) > 0) {
      toast.error("Suppression bloquée : la coopérative contient des producteurs ou des chargements. Utilisez la suspension.");
      return;
    }
    const { error } = await (supabase as any).from("cooperatives").update({ deleted_at: new Date().toISOString() }).eq("id", r.id);
    if (error) { console.error(error); toast.error("Une erreur est survenue."); return; }
    toast.success("Coopérative supprimée."); load();
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={Building2}
        title="Gestion des coopératives"
        description="Créer, modifier, suspendre ou supprimer les coopératives clientes."
        actions={
          <Button asChild>
            <Link to="/gestion/cooperatives/nouvelle"><Plus className="h-4 w-4 mr-2" /> Nouvelle coopérative</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader><CardTitle className="text-base">{rows.length} coopérative{rows.length > 1 ? "s" : ""}</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">Aucune coopérative.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Sigle</TableHead>
                    <TableHead>Ville / Région</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Période</TableHead>
                    <TableHead>Jours</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const meta = STATUS_LABEL[r.status];
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.acronym ?? "—"}</TableCell>
                        <TableCell>{[r.city, r.region].filter(Boolean).join(" / ") || "—"}</TableCell>
                        <TableCell>{r.manager_name ?? "—"}</TableCell>
                        <TableCell>{r.plan_name ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.start_date ? new Date(r.start_date).toLocaleDateString("fr-FR") : "—"}
                          {r.end_date && <> → {new Date(r.end_date).toLocaleDateString("fr-FR")}</>}
                        </TableCell>
                        <TableCell>{r.days_remaining ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={meta.className}>{meta.icon} {meta.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="Modifier"><Pencil className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => openSub(r)} title="Abonnement"><CreditCard className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => toggleSuspend(r)} title={r.status === "suspended" ? "Réactiver" : "Suspendre"}>
                              {r.status === "suspended" ? <PlayCircle className="h-4 w-4 text-emerald-600" /> : <PauseCircle className="h-4 w-4 text-amber-600" />}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => remove(r)} title="Supprimer"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Modifier la coopérative</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label>Nom</Label><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Sigle</Label><Input value={editForm.acronym} onChange={(e) => setEditForm({ ...editForm, acronym: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Téléphone</Label><Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Ville</Label><Input value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Région</Label><Input value={editForm.region} onChange={(e) => setEditForm({ ...editForm, region: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Pays</Label><Input value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email officiel</Label><Input type="email" value={editForm.official_email} onChange={(e) => setEditForm({ ...editForm, official_email: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Responsable</Label><Input value={editForm.manager_name} onChange={(e) => setEditForm({ ...editForm, manager_name: e.target.value })} /></div>
            <div className="col-span-2">
              <ImageUploader
                bucket="cooperative-logos"
                pathPrefix={editing?.id ?? ""}
                value={editForm.logo_path}
                onChange={(path) => setEditForm((f) => ({ ...f, logo_path: path }))}
                label="Logo de la coopérative"
                helper="Visible dans l'en-tête de l'application pour les membres de la coopérative."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
            <Button onClick={submitEdit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!subEdit} onOpenChange={(o) => !o && setSubEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Abonnement — {subEdit?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Plan</Label><Input value={subForm.plan_name} onChange={(e) => setSubForm({ ...subForm, plan_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Date de début</Label><Input type="date" value={subForm.start_date} onChange={(e) => setSubForm({ ...subForm, start_date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Date de fin</Label><Input type="date" value={subForm.end_date} onChange={(e) => setSubForm({ ...subForm, end_date: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select value={subForm.status} onValueChange={(v) => setSubForm({ ...subForm, status: v as Status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Essai</SelectItem>
                  <SelectItem value="active">Actif</SelectItem>
                  <SelectItem value="expired">Expiré</SelectItem>
                  <SelectItem value="suspended">Suspendu</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubEdit(null)}>Annuler</Button>
            <Button onClick={submitSub} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
