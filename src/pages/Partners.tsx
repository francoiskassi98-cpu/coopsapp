import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Handshake, Plus, Pencil, Trash2, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";

type Partner = {
  id: string;
  name: string;
  contact: string | null;
  logo_path: string | null;
  status: string;
  registre_id: string;
};

type Registre = { id: string; name: string; cooperative_id: string };

const BUCKET = "partner-logos";

const signedUrl = async (path: string) => {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
};

export default function Partners() {
  const { cooperativeRefs, isSuperAdmin } = useAuth();
  const [registres, setRegistres] = useState<Registre[]>([]);
  const [registreFilter, setRegistreFilter] = useState<string>("all");
  const [items, setItems] = useState<Partner[]>([]);
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "",
    contact: "",
    logo_path: "",
    status: "actif",
    registre_id: "",
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const loadRegistres = async () => {
    const { data, error } = await (supabase.from("registres") as any)
      .select("id,name,cooperative_id")
      .order("name");
    if (error) {
      console.error("[Partners] loadRegistres", error);
      return;
    }
    setRegistres((data as Registre[]) || []);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("partners")
      .select("id,name,contact,logo_path,status,registre_id")
      .is("deleted_at", null)
      .order("name");
    if (error) {
      console.error("[Partners] load", error);
      toast.error("Impossible de charger les partenaires.", { description: error.message });
    }
    const list = (data as Partner[]) || [];
    setItems(list);

    const map: Record<string, string> = {};
    await Promise.all(
      list.map(async (p) => {
        if (p.logo_path) {
          const url = p.logo_path.startsWith("http") ? p.logo_path : await signedUrl(p.logo_path);
          if (url) map[p.id] = url;
        }
      })
    );
    setLogoUrls(map);
    setLoading(false);
  };

  useEffect(() => {
    loadRegistres();
    load();
  }, []);

  const filteredItems = useMemo(
    () => (registreFilter === "all" ? items : items.filter((p) => p.registre_id === registreFilter)),
    [items, registreFilter]
  );

  const resetForm = () => {
    setEditing(null);
    setForm({
      name: "",
      contact: "",
      logo_path: "",
      status: "actif",
      registre_id: registreFilter !== "all" ? registreFilter : registres[0]?.id ?? "",
    });
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = async (p: Partner) => {
    setEditing(p);
    setForm({
      name: p.name,
      contact: p.contact ?? "",
      logo_path: p.logo_path ?? "",
      status: p.status ?? "actif",
      registre_id: p.registre_id,
    });
    if (p.logo_path) {
      const url = p.logo_path.startsWith("http") ? p.logo_path : await signedUrl(p.logo_path);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
    setOpen(true);
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Fichier trop volumineux (max 2 Mo).");
      return;
    }
    const registre = registres.find((r) => r.id === form.registre_id);
    const coopId = registre?.cooperative_id ?? cooperativeRefs[0]?.id;
    if (!coopId) {
      toast.error("Sélectionnez d'abord un registre pour téléverser le logo.");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${coopId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    if (error) {
      console.error("[Partners] upload", error);
      toast.error("Échec du téléversement du logo.", { description: error.message });
      setUploading(false);
      return;
    }
    if (form.logo_path && !form.logo_path.startsWith("http")) {
      await supabase.storage.from(BUCKET).remove([form.logo_path]);
    }
    const url = await signedUrl(path);
    setForm((f) => ({ ...f, logo_path: path }));
    setPreviewUrl(url);
    setUploading(false);
  };

  const clearLogo = async () => {
    if (form.logo_path && !form.logo_path.startsWith("http")) {
      await supabase.storage.from(BUCKET).remove([form.logo_path]);
    }
    setForm((f) => ({ ...f, logo_path: "" }));
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Le nom du partenaire est requis.");
      return;
    }
    if (!form.registre_id) {
      toast.error("Veuillez sélectionner un registre de rattachement.");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contact: form.contact.trim() || null,
      logo_path: form.logo_path || null,
      status: form.status,
      registre_id: form.registre_id,
    };
    console.info("[Partners] submit", { editing: editing?.id, payload });
    const { error } = editing
      ? await (supabase as any).from("partners").update(payload).eq("id", editing.id)
      : await (supabase as any).from("partners").insert(payload);
    setSaving(false);
    if (error) {
      console.error("[Partners] save error", error);
      const isRls = error.code === "42501";
      const isDup = error.code === "23505";
      toast.error(
        isRls
          ? "Permission refusée par la politique de sécurité (RLS)."
          : isDup
          ? "Un partenaire portant ce nom existe déjà."
          : "Échec de l'enregistrement du partenaire.",
        { description: [error.message, error.details, error.hint].filter(Boolean).join(" — ") }
      );
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
      console.error("[Partners] delete", error);
      toast.error("Impossible de supprimer le partenaire.", { description: error.message });
      return;
    }
    toast.success("Partenaire supprimé.");
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Handshake}
        title="Partenaires"
        description="Acheteurs, exportateurs et partenaires commerciaux."
        actions={
          <div className="flex flex-col sm:flex-row gap-2">
            {(isSuperAdmin || registres.length > 1) && (
              <Select value={registreFilter} onValueChange={setRegistreFilter}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder="Tous les registres" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les registres</SelectItem>
                  {registres.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button onClick={openCreate} disabled={registres.length === 0}>
              <Plus className="h-4 w-4 mr-2" /> Nouveau partenaire
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : registres.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucun registre disponible. Créez d'abord un registre pour y rattacher vos partenaires.
          </CardContent>
        </Card>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucun partenaire pour le moment.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((p) => {
            const reg = registres.find((r) => r.id === p.registre_id);
            return (
              <Card key={p.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {logoUrls[p.id] ? (
                      <img src={logoUrls[p.id]} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <Handshake className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{p.name}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={p.status === "actif" ? "default" : "secondary"}>{p.status}</Badge>
                      {reg && <span className="text-xs text-muted-foreground truncate">{reg.name}</span>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {p.contact && <p className="text-sm text-muted-foreground truncate">{p.contact}</p>}
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
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le partenaire" : "Nouveau partenaire"}</DialogTitle>
            <DialogDescription>Renseignez les informations du partenaire et son registre de rattachement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Registre *</Label>
              <Select value={form.registre_id} onValueChange={(v) => setForm({ ...form, registre_id: v })}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un registre" /></SelectTrigger>
                <SelectContent>
                  {registres.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0 border">
                  {previewUrl ? (
                    <img src={previewUrl} alt="logo" className="h-full w-full object-cover" />
                  ) : (
                    <Handshake className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading || !form.registre_id}>
                  {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  {form.logo_path ? "Remplacer" : "Téléverser"}
                </Button>
                {form.logo_path && (
                  <Button type="button" variant="ghost" size="sm" onClick={clearLogo}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG ou SVG — 2 Mo max.</p>
            </div>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={submit} disabled={saving || uploading}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
