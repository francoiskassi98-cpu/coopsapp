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
import PageHeader from "@/components/PageHeader";

interface Registre { id: string; name: string }
interface Partner { id: string; name: string }

interface Template {
  id: string;
  registre_id: string;
  template_name: string;
  is_default: boolean;
  is_active: boolean;
  partner_id: string | null;
  description: string | null;
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
  is_active: true,
  partner_id: null,
  description: "",
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

// Champs autorisés côté DB pour la persistance (whitelist)
const PERSIST_FIELDS: (keyof Template)[] = [
  "registre_id", "template_name", "is_default", "is_active", "partner_id", "description",
  "title", "subtitle", "slogan", "coop_logo_path", "partner_logo_path", "logo_position",
  "custom_header", "custom_footer",
  "show_driver", "show_truck", "show_trailer", "show_bill_of_lading",
  "show_destination", "show_project", "show_partner", "show_departure_date",
  "show_num_bags", "show_total_weight", "show_num_producers", "show_partner_logo",
];

export default function ShipmentTemplates() {
  const [registres, setRegistres] = useState<Registre[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [registreFilter, setRegistreFilter] = useState<string>("all");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: rs }, { data: ps }, { data: ts }] = await Promise.all([
      (supabase.from("registres") as any).select("id,name").order("name"),
      (supabase.from("partners") as any).select("id,name").order("name"),
      (supabase.from("shipment_excel_templates") as any).select("*").order("created_at", { ascending: false }),
    ]);
    setRegistres((rs || []) as Registre[]);
    setPartners((ps || []) as Partner[]);
    setTemplates((ts || []) as Template[]);
    setLoading(false);
  }

  const filtered = useMemo(
    () => registreFilter === "all" ? templates : templates.filter(t => t.registre_id === registreFilter),
    [templates, registreFilter]
  );

  function openNew() {
    setEditing({
      ...defaults,
      registre_id: registreFilter !== "all" ? registreFilter : (registres[0]?.id ?? ""),
    });
  }

  async function save() {
    if (!editing || !editing.registre_id || !editing.template_name?.trim()) {
      toast({
        title: "Champs requis",
        description: !editing?.registre_id ? "Veuillez sélectionner un registre." : "Veuillez saisir un nom de modèle.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      // Whitelist stricte pour éviter d'envoyer des colonnes inexistantes
      const payload: Record<string, any> = {};
      for (const k of PERSIST_FIELDS) {
        if ((editing as any)[k] !== undefined) payload[k] = (editing as any)[k];
      }
      // Normalisations
      if (payload.partner_id === "") payload.partner_id = null;
      if (payload.coop_logo_path === "") payload.coop_logo_path = null;
      if (payload.partner_logo_path === "") payload.partner_logo_path = null;

      let error: any;
      if ((editing as any).id) {
        ({ error } = await (supabase.from("shipment_excel_templates") as any)
          .update(payload).eq("id", (editing as any).id));
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        payload.created_by = userRes.user?.id ?? null;
        ({ error } = await (supabase.from("shipment_excel_templates") as any).insert(payload));
      }
      if (error) {
        console.error("[shipment_excel_templates] save error", { error, payload });
        const msg = [error.message, error.details, error.hint].filter(Boolean).join(" — ");
        toast({
          title: (editing as any).id ? "Échec de la modification" : "Échec de la création",
          description: msg || "Vérifiez les champs obligatoires (registre, nom) et vos permissions.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: (editing as any).id ? "Modèle modifié" : "Modèle créé" });
      setEditing(null);
      load();
    } catch (e: any) {
      console.error("[shipment_excel_templates] save exception", e);
      toast({ title: "Erreur inattendue", description: e?.message ?? "Réessayez.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleteId) return;
    const { error } = await (supabase.from("shipment_excel_templates") as any).delete().eq("id", deleteId);
    if (error) {
      console.error("[shipment_excel_templates] delete error", error);
      toast({
        title: "Suppression impossible",
        description: [error.message, error.hint].filter(Boolean).join(" — ") || "Une erreur est survenue.",
        variant: "destructive",
      });
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
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        icon={FileSpreadsheet}
        title="Modèles Excel — Chargements"
        description="Personnalisez l'apparence et le contenu des fiches de chargement exportées."
        actions={
          <>
            <Select value={registreFilter} onValueChange={setRegistreFilter}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Tous les registres" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les registres</SelectItem>
                {registres.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={openNew} disabled={registres.length === 0}>
              <Plus className="h-4 w-4 mr-2" />Nouveau modèle
            </Button>
          </>
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement...</p>
      ) : registres.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Aucun registre disponible. Créez d'abord un registre pour rattacher vos modèles.
        </CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Aucun modèle. Créez-en un pour personnaliser vos exports.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(t => {
            const reg = registres.find(r => r.id === t.registre_id);
            return (
              <Card key={t.id} className="shadow-glass hover:shadow-float transition-all overflow-hidden">
                <div className={`h-1 w-full ${t.is_default ? "bg-primary" : "bg-muted"}`} />
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="h-4 w-4" />
                      </span>
                      <span className="truncate">{t.template_name}</span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {!t.is_active && <Badge variant="outline">Inactif</Badge>}
                      {t.is_default && <Badge variant="default" className="gap-1"><Star className="h-3 w-3" />Défaut</Badge>}
                    </span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground pl-10">{reg?.name ?? "—"}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs text-muted-foreground line-clamp-2">{t.title || "—"}</div>
                  <div className="flex flex-wrap gap-1">
                    {togglesSchema.filter(s => t[s.key]).slice(0, 6).map(s => (
                      <Badge key={s.key} variant="secondary" className="text-[10px]">{s.label}</Badge>
                    ))}
                  </div>
                  <div className="flex justify-end gap-1 pt-1 border-t">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => setDeleteId(t.id)}><Trash2 className="h-4 w-4" /></Button>
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
                  <Label>Registre *</Label>
                  <Select value={editing.registre_id || ""} onValueChange={(v) => setEditing({ ...editing, registre_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>{registres.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nom du modèle *</Label>
                  <Input value={editing.template_name || ""} onChange={e => setEditing({ ...editing, template_name: e.target.value })} />
                </div>
                <div>
                  <Label>Partenaire</Label>
                  <Select
                    value={editing.partner_id ?? "none"}
                    onValueChange={(v) => setEditing({ ...editing, partner_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun</SelectItem>
                      {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Description</Label>
                  <Textarea rows={2} value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label>Actif</Label>
                  <Switch checked={editing.is_active !== false} onCheckedChange={(c) => setEditing({ ...editing, is_active: c })} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label>Modèle par défaut</Label>
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
                    pathPrefix={`${editing.registre_id || "shared"}/templates`}
                    value={editing.coop_logo_path || null}
                    onChange={(p) => setEditing({ ...editing, coop_logo_path: p })}
                    label="Logo registre"
                  />
                </div>
                <div>
                  <ImageUploader
                    bucket="shipment-assets"
                    pathPrefix={`${editing.registre_id || "shared"}/templates`}
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
                  coopName={registres.find(r => r.id === editing.registre_id)?.name}
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
