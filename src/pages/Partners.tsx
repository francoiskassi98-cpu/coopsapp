import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Handshake, Plus, Pencil, Trash2, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

type Partner = {
  id: string;
  name: string;
  contact: string | null;
  logo_path: string | null;
  status: string;
};

const BUCKET = "partner-logos";

const signedUrl = async (path: string) => {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
};

export default function Partners() {
  const { cooperativeRefs } = useAuth();
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
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("partners")
      .select("id,name,contact,logo_path,status")
      .is("deleted_at", null)
      .order("name");
    if (error) {
      console.error(error);
      toast.error("Une erreur est survenue.");
    }
    const list = (data as Partner[]) || [];
    setItems(list);

    // Resolve signed URLs for stored logos
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
    load();
  }, []);

  const resetForm = () => {
    setEditing(null);
    setForm({ name: "", contact: "", logo_path: "", status: "actif" });
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
    setUploading(true);
    const coopId = cooperativeRefs[0]?.id;
    if (!coopId) {
      toast.error("Aucune coopérative associée : impossible de téléverser le logo.");
      setUploading(false);
      return;
    }
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${coopId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    if (error) {
      console.error(error);
      toast.error("Une erreur est survenue.");
      setUploading(false);
      return;
    }
    // Remove old logo when replacing
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
      toast.error("Le nom est requis.");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contact: form.contact.trim() || null,
      logo_path: form.logo_path || null,
      status: form.status,
    };
    const { error } = editing
      ? await (supabase as any).from("partners").update(payload).eq("id", editing.id)
      : await (supabase as any).from("partners").insert(payload);
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
                <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {logoUrls[p.id] ? (
                    <img src={logoUrls[p.id]} alt={p.name} className="h-full w-full object-cover" />
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

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
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
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
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
