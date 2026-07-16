import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { FileSpreadsheet, Plus, Pencil, Trash2, Star, Eye } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplatePreview } from "@/components/shipments/TemplatePreview";
import { ImageUploader } from "@/components/ui/ImageUploader";

interface Coop { id: string; name: string }

interface Template {
  id: string;
  cooperative_id: string;
  template_name: string;
  is_default: boolean;
  title: string | null;
  subtitle: string | null;
  slogan: string | null;
  coop_logo_path: string | null;
  partner_logo_path: string | null;
  logo_position: "left" | "center" | "right" | "split";
  custom_header: string | null;
  custom_footer: string | null;
  show_driver: boolean;
  show_truck: boolean;
  show_trailer: boolean;
  show_bill_of_lading: boolean;
  show_destination: boolean;
  show_project: boolean;
  show_partner: boolean;
  show_departure_date: boolean;
  show_num_bags: boolean;
  show_total_weight: boolean;
  show_num_producers: boolean;
  show_partner_logo: boolean;
}

const defaults: Partial<Template> = {
  template_name: "Modèle par défaut",
  is_default: false,
  title: "FICHE DE CHARGEMENT",
  subtitle: "",
  slogan: "",
  coop_logo_path: "",
  partner_logo_path: "",
  logo_position: "left",
  custom_header: "",
  custom_footer: "",
  show_driver: true, show_truck: true, show_trailer: true, show_bill_of_lading: true,
  show_destination: true, show_project: true, show_partner: true, show_departure_date: true,
  show_num_bags: true, show_total_weight: true, show_num_producers: true, show_partner_logo: true,
};

export default function ShipmentTemplates() {
  const [coops, setCoops] = useState<Coop[]>([]);
  const [coopFilter, setCoopFilter] = useState<string>("all");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: cs }, { data: ts }] = await Promise.all([
      supabase.from("cooperatives").select("id,name").order("name"),
      (supabase.from("shipment_excel_templates") as any).select("*").order("created_at", { ascending: false }),
    ]);
    setCoops((cs || []) as Coop[]);
    setTemplates((ts || []) as Template[]);
    setLoading(false);
  }

  const filtered = useMemo(() => coopFilter === "all" ? templates : templates.filter(t => t.cooperative_id === coopFilter), [templates, coopFilter]);

  function openNew() {
    setEditing({ ...defaults, cooperative_id: coopFilter !== "all" ? coopFilter : (coops[0]?.id ?? "") });
  }

  async function save() {
    if (!editing || !editing.cooperative_id || !editing.template_name) {
      toast({ title: "Champs requis", description: "Coopérative et nom du modèle requis.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...editing };
      delete (payload as any).id;
      let error;
      if ((editing as any).id) {
        ({ error } = await (supabase.from("shipment_excel_templates") as any).update(payload).eq("id", (editing as any).id));
      } else {
        ({ error } = await (supabase.from("shipment_excel_templates") as any).insert(payload));
      }
      if (error) throw error;
      toast({ title: "Modèle enregistré" });
      setEditing(null);
      load();
    } catch (e) {
      console.error(e);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleteId) return;
    const { error } = await (supabase.from("shipment_excel_templates") as any).delete().eq("id", deleteId);
    if (error) {
      console.error(error);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } else {
      toast({ title: "Modèle supprimé" });
      load();
    }
    setDeleteId(null);
  }

  const togglesSchema: Array<{ key: keyof Template; label: string }> = [
    { key: "show_driver", label: "Nom chauffeur" },
    { key: "show_truck", label: "Numéro camion" },
    { key: "show_trailer", label: "Numéro remorque" },
    { key: "show_bill_of_lading", label: "Numéro connaissement" },
    { key: "show_destination", label: "Destination" },
    { key: "show_project", label: "Projet" },
    { key: "show_partner", label: "Partenaire" },
    { key: "show_departure_date", label: "Date de départ" },
    { key: "show_num_bags", label: "Nombre de sacs" },
    { key: "show_total_weight", label: "Poids total" },
    { key: "show_num_producers", label: "Nombre producteurs" },
    { key: "show_partner_logo", label: "Logo partenaire" },
  ];

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        icon={FileSpreadsheet}
        title="Modèles Excel — Chargements"
        description="Personnalisez l'apparence et le contenu des fiches de chargement exportées."
        actions={
          <>
            <Select value={coopFilter} onValueChange={setCoopFilter}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Toutes les coopératives" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les coopératives</SelectItem>
                {coops.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={openNew} size="sm"><Plus className="h-4 w-4 mr-2" />Nouveau modèle</Button>
          </>
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement...</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Aucun modèle. Créez-en un pour personnaliser vos exports.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(t => {
            const coop = coops.find(c => c.id === t.cooperative_id);
            return (
              <Card key={t.id} className="hover:shadow-glow transition-all">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="truncate">{t.template_name}</span>
                    {t.is_default && <Badge variant="default" className="gap-1"><Star className="h-3 w-3" />Défaut</Badge>}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{coop?.name ?? "—"}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs text-muted-foreground line-clamp-2">{t.title || "—"}</div>
                  <div className="flex flex-wrap gap-1">
                    {togglesSchema.filter(s => t[s.key]).slice(0, 6).map(s => (
                      <Badge key={s.key} variant="secondary" className="text-[10px]">{s.label}</Badge>
                    ))}
                  </div>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteId(t.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{(editing as any)?.id ? "Modifier le modèle" : "Nouveau modèle"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <Tabs defaultValue="config" className="w-full">
              <TabsList>
                <TabsTrigger value="config"><Pencil className="h-4 w-4 mr-1" />Configuration</TabsTrigger>
                <TabsTrigger value="preview"><Eye className="h-4 w-4 mr-1" />Aperçu</TabsTrigger>
              </TabsList>

              <TabsContent value="config" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Coopérative *</Label>
                  <Select value={editing.cooperative_id || ""} onValueChange={(v) => setEditing({ ...editing, cooperative_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>{coops.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nom du modèle *</Label>
                  <Input value={editing.template_name || ""} onChange={e => setEditing({ ...editing, template_name: e.target.value })} />
                </div>
                <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
                  <Label>Modèle par défaut pour cette coopérative</Label>
                  <Switch checked={!!editing.is_default} onCheckedChange={(c) => setEditing({ ...editing, is_default: c })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Titre principal</Label>
                  <Input value={editing.title || ""} onChange={e => setEditing({ ...editing, title: e.target.value })} />
                </div>
                <div>
                  <Label>Sous-titre</Label>
                  <Input value={editing.subtitle || ""} onChange={e => setEditing({ ...editing, subtitle: e.target.value })} />
                </div>
                <div>
                  <Label>Slogan</Label>
                  <Input value={editing.slogan || ""} onChange={e => setEditing({ ...editing, slogan: e.target.value })} />
                </div>
                <div>
                  <ImageUploader
                    bucket="shipment-assets"
                    pathPrefix={`${editing.cooperative_id || "shared"}/templates`}
                    value={editing.coop_logo_path || null}
                    onChange={(p) => setEditing({ ...editing, coop_logo_path: p })}
                    label="Logo coopérative"
                  />
                </div>
                <div>
                  <ImageUploader
                    bucket="shipment-assets"
                    pathPrefix={`${editing.cooperative_id || "shared"}/templates`}
                    value={editing.partner_logo_path || null}
                    onChange={(p) => setEditing({ ...editing, partner_logo_path: p })}
                    label="Logo partenaire"
                  />
                </div>
                <div>
                  <Label>Position des logos</Label>
                  <Select value={editing.logo_position || "left"} onValueChange={(v: any) => setEditing({ ...editing, logo_position: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Gauche</SelectItem>
                      <SelectItem value="center">Centre</SelectItem>
                      <SelectItem value="right">Droite</SelectItem>
                      <SelectItem value="split">Coop gauche / Partenaire droite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>En-tête personnalisé</Label>
                  <Textarea rows={2} value={editing.custom_header || ""} onChange={e => setEditing({ ...editing, custom_header: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Pied de page</Label>
                  <Textarea rows={2} value={editing.custom_footer || ""} onChange={e => setEditing({ ...editing, custom_footer: e.target.value })} />
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold">Champs affichés dans le fichier</Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {togglesSchema.map(s => (
                    <div key={s.key} className="flex items-center justify-between rounded-md border p-2">
                      <span className="text-sm">{s.label}</span>
                      <Switch
                        checked={!!editing[s.key]}
                        onCheckedChange={(c) => setEditing({ ...editing, [s.key]: c })}
                      />
                    </div>
                  ))}
                </div>
              </div>
              </TabsContent>

              <TabsContent value="preview">
                <p className="text-xs text-muted-foreground mb-2">
                  Aperçu indicatif — les données présentées sont fictives.
                </p>
                <TemplatePreview
                  {...(editing as any)}
                  coopName={coops.find(c => c.id === editing.cooperative_id)?.name}
                />
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Enregistrement..." : "Enregistrer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Supprimer ce modèle ?</DialogTitle></DialogHeader>
          <p className="text-sm">Cette action est irréversible.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Annuler</Button>
            <Button variant="destructive" onClick={remove}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
