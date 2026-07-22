import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { distributeShipment, getCurrentCampaign, normalizeCampaign, type DistributionResult } from "@/lib/shipment-utils";
import { useSortableTable, SortableHeader } from "@/hooks/useSortableTable";
import { toast } from "@/hooks/use-toast";
import { Truck, Plus, Download, Pencil, Check, X, FileSpreadsheet, FolderPlus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { generateShipmentFiche } from "@/services/excel/shipment-fiche-excel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ImportShipments from "@/pages/ImportShipments";
import ShipmentDetails from "@/components/ShipmentDetails";
import ShipmentHistory from "@/components/ShipmentHistory";
import { TemplatePreview, type TemplatePreviewData } from "@/components/shipments/TemplatePreview";
import PageHeader from "@/components/PageHeader";

export default function CreateShipment() {
  const [totalWeight, setTotalWeight] = useState("");
  const [totalBags, setTotalBags] = useState("");
  const [connaissement, setConnaissement] = useState("");
  const [driverName, setDriverName] = useState("");
  const [truckNumber, setTruckNumber] = useState("");
  const [trailerNumber, setTrailerNumber] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [project, setProject] = useState(""); // project_id
  const [partnerId, setPartnerId] = useState("");
  const [zone, setZone] = useState("");
  const [destination, setDestination] = useState("");
  const [campaign, setCampaign] = useState("Principale");
  const [partners, setPartners] = useState<any[]>([]);
  const [newPartnerName, setNewPartnerName] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [newProject, setNewProject] = useState<{ name: string; code: string; partner_id: string; description: string; is_active: boolean }>({ name: "", code: "", partner_id: "", description: "", is_active: true });
  const [creatingProject, setCreatingProject] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [preview, setPreview] = useState<DistributionResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editBags, setEditBags] = useState("");
  const { sortConfig, toggleSort, sortData } = useSortableTable();
  const { role } = useAuth();
  const canCreateProject = role === "super_admin" || role === "coop_admin" || role === "agent";

  const [cooperatives, setCooperatives] = useState<{ id: string; name: string }[]>([]);
  const [coopDelivered, setCoopDelivered] = useState<Record<string, number>>({});
  const [coopPotential, setCoopPotential] = useState<Record<string, { potentiel: number; remaining: number }>>({});
  const [suggestedReceipt, setSuggestedReceipt] = useState<string>("");
  const [receiptNumber, setReceiptNumber] = useState<string>("");
  const [selectedCoopId, setSelectedCoopId] = useState<string>("");

  useEffect(() => {
    supabase.from("partners").select("*").order("name").then(({ data }) => setPartners(data || []));
    loadCooperatives();
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) || null,
    [templates, templateId]
  );

  async function loadTemplatesForCoop(coopId: string) {
    if (!coopId) { setTemplates([]); setTemplateId(""); return; }
    const { data } = await (supabase as any)
      .from("shipment_excel_templates")
      .select("*")
      .eq("cooperative_id", coopId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    const list = (data || []) as any[];
    setTemplates(list);
    // auto-select default
    const def = list.find((t) => t.is_default) || list[0];
    setTemplateId(def?.id || "");
  }

  async function loadProjectsForCoop(coopId: string) {
    if (!coopId) { setProjects([]); setProject(""); return; }
    const { data } = await (supabase as any)
      .from("projects")
      .select("*, partners(name)")
      .eq("registre_id", coopId)
      .eq("is_active", true)
      .order("name");
    setProjects((data || []) as any[]);
  }



  async function loadCooperatives() {
    // Load registres (business entity) — id + name
    const { data: coopData } = await (supabase as any).from("registres").select("id, name").order("name");
    const coopList = (coopData || []) as { id: string; name: string }[];
    setCooperatives(coopList);
    const nameById: Record<string, string> = {};
    coopList.forEach((c) => { nameById[c.id] = c.name; });

    // Get producer stats by registre
    let allProducers: any[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await (supabase as any).from("producers").select("registre_id, delivery_potential, remaining_potential").range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allProducers = allProducers.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    const potMap: Record<string, { potentiel: number; remaining: number }> = {};
    allProducers.forEach((p) => {
      const key = nameById[p.registre_id];
      if (key) {
        if (!potMap[key]) potMap[key] = { potentiel: 0, remaining: 0 };
        potMap[key].potentiel += Number(p.delivery_potential);
        potMap[key].remaining += Number(p.remaining_potential);
      }
    });
    setCoopPotential(potMap);

    // Get delivered by zone from active shipments
    let allShipments: any[] = [];
    from = 0;
    while (true) {
      const { data } = await supabase.from("shipments").select("zone, total_weight").eq("status", "active").range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allShipments = allShipments.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    const delMap: Record<string, number> = {};
    allShipments.forEach((s) => {
      if (s.zone) delMap[s.zone] = (delMap[s.zone] || 0) + Number(s.total_weight);
    });
    setCoopDelivered(delMap);
  }

  async function loadNextReceiptForCooperative(cooperativeId: string) {
    if (!cooperativeId) { setSuggestedReceipt(""); setReceiptNumber(""); return; }

    // Appel RPC : MAX(receipt_number::bigint) filtré par cooperative_id
    // La fonction SQL fait le JOIN shipments→deliveries côté serveur en une seule requête.
    const { data, error } = await (supabase as any).rpc("get_max_receipt_number", {
      p_cooperative_id: cooperativeId,
    });

    if (error) {
      console.error("Erreur get_max_receipt_number:", error);
      setSuggestedReceipt("000001");
      setReceiptNumber("");
      return;
    }

    // data est la valeur texte du receipt_number max, ou null si aucune livraison
    const maxNum = data ? parseInt(String(data).replace(/\D/g, ""), 10) : 0;
    const next = String((isNaN(maxNum) ? 0 : maxNum) + 1).padStart(6, "0");
    setSuggestedReceipt(next);
    setReceiptNumber("");
  }

  const handleZoneChange = (coopId: string) => {
    setSelectedCoopId(coopId);
    const coop = cooperatives.find(c => c.id === coopId);
    setZone(coop?.name || "");
    loadNextReceiptForCooperative(coopId);
  };

  const selectedCoopStats = useMemo(() => {
    if (!zone) return null;
    const pot = coopPotential[zone] || { potentiel: 0, remaining: 0 };
    const del = coopDelivered[zone] || 0;
    return { potentiel: pot.potentiel, delivered: del, remaining: pot.remaining };
  }, [zone, coopPotential, coopDelivered]);

  const missingFields = useMemo(() => {
    const m: string[] = [];
    if (!totalWeight) m.push("Poids total");
    if (!totalBags) m.push("Nombre de sacs");
    if (!connaissement.trim()) m.push("N° Connaissement");
    if (!startDate) m.push("Date début");
    if (!endDate) m.push("Date fin");
    if (!project) m.push("Projet");
    if (!partnerId) m.push("Partenaire");
    if (!selectedCoopId) m.push("Registre");
    if (!destination) m.push("Destination");
    if (!driverName.trim()) m.push("Chauffeur");
    if (!truckNumber.trim()) m.push("N° Camion");
    if (!trailerNumber.trim()) m.push("N° Remorque");
    if (!departureDate) m.push("Date départ");
    return m;
  }, [totalWeight, totalBags, connaissement, startDate, endDate, project, partnerId, selectedCoopId, destination, driverName, truckNumber, trailerNumber, departureDate]);

  const handleCalculate = async () => {
    if (missingFields.length > 0) {
      toast({ title: "Champs requis manquants", description: `Renseignez : ${missingFields.join(", ")}.`, variant: "destructive" });
      return;
    }

    // Fetch disabled sections
    const { data: disabledSectionsData } = await supabase.from("disabled_sections").select("section_name");
    const disabledSectionNames = new Set((disabledSectionsData || []).map((d: any) => d.section_name));

    // Fetch only active producers of the selected cooperative with remaining potential, exclude disabled sections
    const coopName = cooperatives.find(c => c.id === selectedCoopId)?.name || "";
    let allActiveProducers: any[] = [];
    let fetchFrom = 0;
    const FETCH_PAGE = 1000;
    while (true) {
      const { data } = await (supabase as any)
        .from("producers")
        .select("id, full_name, section, plantation_code, remaining_potential, delivery_potential")
        .eq("is_active", true)
        .eq("cooperative", coopName)
        .gt("remaining_potential", 0)
        .order("section")
        .range(fetchFrom, fetchFrom + FETCH_PAGE - 1);
      if (!data || data.length === 0) break;
      allActiveProducers = allActiveProducers.concat(data);
      if (data.length < FETCH_PAGE) break;
      fetchFrom += FETCH_PAGE;
    }

    // Filter out producers from disabled sections
    const producers = allActiveProducers.filter((p: any) => !disabledSectionNames.has(p.section));

    if (!producers || producers.length === 0) {
      toast({ title: "Aucun producteur disponible", description: "Importez d'abord des producteurs avec un potentiel restant.", variant: "destructive" });
      return;
    }

    const effectiveReceipt = receiptNumber.trim() || suggestedReceipt;
    const lastNum = effectiveReceipt ? parseInt(effectiveReceipt, 10) - 1 : 0;

    const results = distributeShipment(
      producers.map((p) => ({ ...p, remaining_potential: Number(p.remaining_potential), delivery_potential: Number(p.delivery_potential) })),
      Number(totalWeight),
      Number(totalBags),
      new Date(startDate),
      new Date(endDate),
      lastNum
    );

    if (results.length === 0) {
      toast({ title: "Distribution impossible", description: "Le potentiel restant des producteurs est insuffisant.", variant: "destructive" });
      return;
    }

    setPreview(results);
  };

  const persistShipment = async (): Promise<string | null> => {
    if (preview.length === 0) return null;

    const { data: shipment, error: shipErr } = await supabase
      .from("shipments")
      .insert({
        connaissement: connaissement || null,
        total_weight: Number(totalWeight),
        total_bags: Number(totalBags),
        avg_bag_weight: Number(totalWeight) / Number(totalBags),
        project,
        partner_id: partnerId || null,
        zone: zone || null,
        cooperative_id: selectedCoopId || null,
        destination,
        campaign: normalizeCampaign(getCurrentCampaign()),
        delivery_start: startDate,
        delivery_end: endDate,
        driver_name: driverName.trim() || null,
        truck_number: truckNumber.trim() || null,
        trailer_number: trailerNumber.trim() || null,
        departure_date: departureDate || null,
      } as any)
      .select()
      .single();

    if (shipErr) throw shipErr;

    const deliveries = preview.map((d) => ({
      shipment_id: shipment.id,
      producer_id: d.producer_id,
      receipt_number: d.receipt_number,
      delivery_date: d.delivery_date,
      net_weight: d.allocated_weight,
      num_bags: d.num_bags,
    }));

    const { error: delErr } = await (supabase as any).from("deliveries").insert(deliveries);
    if (delErr) throw delErr;

    for (const d of preview) {
      const { data: producer } = await supabase.from("producers").select("remaining_potential").eq("id", d.producer_id).single();
      if (producer) {
        await supabase
          .from("producers")
          .update({ remaining_potential: Number(producer.remaining_potential) - d.allocated_weight })
          .eq("id", d.producer_id);
      }
    }

    return shipment.id as string;
  };

  const resetForm = () => {
    setPreview([]);
    setConnaissement("");
    setTotalWeight("");
    setTotalBags("");
    setDriverName("");
    setTruckNumber("");
    setTrailerNumber("");
    setDepartureDate("");
  };

  const handleSave = async () => {
    if (preview.length === 0) return;
    setSaving(true);
    try {
      const count = preview.length;
      await persistShipment();
      toast({ title: "Chargement créé", description: `${count} fiches de livraison générées.` });
      resetForm();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addPartner = async () => {
    if (!newPartnerName.trim()) return;
    const { data, error } = await (supabase as any).from("partners").insert({ name: newPartnerName.trim() }).select().single();
    if (error) {
      console.error(error);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } else {
      setPartners([...partners, data]);
      setPartnerId(data.id);
      setNewPartnerName("");
      setDialogOpen(false);
    }
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditWeight(String(preview[index].allocated_weight));
    setEditBags(String(preview[index].num_bags));
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditWeight("");
    setEditBags("");
  };

  const handleSaveEdit = (index: number) => {
    const newWeight = parseInt(editWeight, 10);
    const newBags = parseInt(editBags, 10);
    if (isNaN(newWeight) || newWeight <= 0 || isNaN(newBags) || newBags <= 0) {
      toast({ title: "Valeurs invalides", variant: "destructive" });
      return;
    }
    if (newWeight / newBags > 90) {
      toast({ title: "Poids par sac trop élevé", description: "Maximum 90 kg par sac.", variant: "destructive" });
      return;
    }

    const updated = [...preview];
    const oldWeight = updated[index].allocated_weight;
    const weightDiff = newWeight - oldWeight;

    updated[index] = { ...updated[index], allocated_weight: newWeight, num_bags: newBags };

    // Redistribute the weight difference across other producers proportionally
    if (weightDiff !== 0 && updated.length > 1) {
      const othersTotal = updated.reduce((s, d, i) => i !== index ? s + d.allocated_weight : s, 0);
      let remaining = -weightDiff;
      for (let i = 0; i < updated.length; i++) {
        if (i === index) continue;
        if (i === updated.length - 1 || (i === updated.length - 2 && index === updated.length - 1)) {
          // Last other producer gets the remainder
          updated[i] = { ...updated[i], allocated_weight: updated[i].allocated_weight + remaining };
          remaining = 0;
        } else {
          const share = Math.round((updated[i].allocated_weight / othersTotal) * (-weightDiff));
          updated[i] = { ...updated[i], allocated_weight: updated[i].allocated_weight + share };
          remaining -= share;
        }
      }
    }

    setPreview(updated);
    setEditingIndex(null);
  };

  const handleSaveAndDownload = async () => {
    if (preview.length === 0) return;
    setSaving(true);
    try {
      const count = preview.length;
      const shipmentId = await persistShipment();
      if (!shipmentId) return;
      await generateShipmentFiche(shipmentId);
      toast({ title: "Chargement créé", description: `${count} fiches générées et fiche Excel téléchargée.` });
      resetForm();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={Truck}
        title="Chargements"
        description="Créer, suivre et distribuer les chargements de la campagne en cours."
      />

      <Tabs defaultValue="create">
        <TabsList className="bg-muted/50 p-1 rounded-full h-auto flex-wrap">
          <TabsTrigger value="create" className="rounded-full data-[state=active]:bg-background data-[state=active]:shadow-glass px-4 py-2">Créer un chargement</TabsTrigger>
          <TabsTrigger value="history" className="rounded-full data-[state=active]:bg-background data-[state=active]:shadow-glass px-4 py-2">Historique</TabsTrigger>
          <TabsTrigger value="details" className="rounded-full data-[state=active]:bg-background data-[state=active]:shadow-glass px-4 py-2">Détail des chargements</TabsTrigger>
          <TabsTrigger value="import" className="rounded-full data-[state=active]:bg-background data-[state=active]:shadow-glass px-4 py-2">Importer les anciens chargements</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="shadow-glass">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Truck className="h-4 w-4" /></span>
                  Paramètres du chargement
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Poids total demandé (kg) *</Label>
                    <Input type="number" value={totalWeight} onChange={(e) => setTotalWeight(e.target.value)} placeholder="43500" />
                  </div>
                  <div className="space-y-2">
                    <Label>Nombre de sacs *</Label>
                    <Input type="number" value={totalBags} onChange={(e) => setTotalBags(e.target.value)} placeholder="670" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>N° Connaissement *</Label>
                  <Input value={connaissement} onChange={(e) => setConnaissement(e.target.value)} placeholder="SC101410-..." />
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Informations transport (obligatoires)</p>
                  <div className="space-y-2">
                    <Label>Nom du chauffeur *</Label>
                    <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="KONATÉ SEYDOU" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>N° Camion *</Label>
                      <Input value={truckNumber} onChange={(e) => setTruckNumber(e.target.value)} placeholder="AA886EA04" />
                    </div>
                    <div className="space-y-2">
                      <Label>N° Remorque *</Label>
                      <Input value={trailerNumber} onChange={(e) => setTrailerNumber(e.target.value)} placeholder="8142KT03" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Date départ *</Label>
                    <Input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date début livraison *</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Date fin livraison *</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Projet *</Label>
                  <Select value={project} onValueChange={setProject}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Fairtrade">Fairtrade</SelectItem>
                      <SelectItem value="Rainforest Alliance">Rainforest Alliance</SelectItem>
                      <SelectItem value="Ordinaire">Ordinaire</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Partenaire</Label>
                  <div className="flex gap-2">
                    <Select value={partnerId} onValueChange={setPartnerId}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                      <SelectContent>
                        {partners.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="icon"><Plus className="h-4 w-4" /></Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Ajouter un partenaire</DialogTitle></DialogHeader>
                        <div className="space-y-4">
                          <Input value={newPartnerName} onChange={(e) => setNewPartnerName(e.target.value)} placeholder="Nom du partenaire" />
                          <Button onClick={addPartner} className="w-full">Ajouter</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Registre *</Label>
                  <Select value={selectedCoopId} onValueChange={handleZoneChange}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner un registre" /></SelectTrigger>
                    <SelectContent>
                      {cooperatives.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedCoopId && (
                  <div className="space-y-2">
                    <Label>Prochain N° Reçu</Label>
                    <Input
                      value={receiptNumber}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        setReceiptNumber(val);
                      }}
                      placeholder={suggestedReceipt || "Chargement..."}
                      className="font-mono"
                      maxLength={6}
                    />
                    {suggestedReceipt && (
                      <p className="text-xs text-muted-foreground">
                        Suggestion : <span className="font-mono font-medium">{suggestedReceipt}</span> — modifiable, les suivants seront générés à partir du numéro saisi.
                      </p>
                    )}
                  </div>
                )}

                {selectedCoopStats && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Stats registre — {zone}</p>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Potentiel</p>
                        <p className="font-semibold">{selectedCoopStats.potentiel.toLocaleString("fr-FR")} kg</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Livré</p>
                        <p className="font-semibold">{selectedCoopStats.delivered.toLocaleString("fr-FR")} kg</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Restant</p>
                        <p className="font-semibold">{selectedCoopStats.remaining.toLocaleString("fr-FR")} kg</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Destination *</Label>
                  <Select value={destination} onValueChange={setDestination}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Abidjan">Abidjan</SelectItem>
                      <SelectItem value="San-Pedro">San-Pedro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Campagne</Label>
                  <Select value={campaign} onValueChange={setCampaign}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Principale">Principale</SelectItem>
                      <SelectItem value="Intermédiaire">Intermédiaire</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Campagne actuelle : {getCurrentCampaign()}</p>
                </div>

                {missingFields.length > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Champs requis manquants : {missingFields.join(", ")}.
                  </p>
                )}
                <Button onClick={handleCalculate} className="w-full" disabled={missingFields.length > 0}>
                  Calculer la distribution
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-glass">
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Download className="h-4 w-4" /></span>
                    Aperçu du chargement
                  </CardTitle>
                  {preview.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      <Button variant="outline" onClick={handleSaveAndDownload} disabled={saving}>
                        <Download className="h-4 w-4 mr-2" /> Enregistrer et télécharger
                      </Button>
                      <Button onClick={handleSave} disabled={saving}>
                        {saving ? "Enregistrement..." : "Valider et enregistrer"}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {preview.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">
                    Remplissez le formulaire et cliquez sur « Calculer la distribution » pour voir l'aperçu.
                  </p>
                ) : (
                  <>
                    <p className="text-sm mb-3">
                      {preview.length} producteurs • {preview.reduce((s, d) => s + d.num_bags, 0)} sacs •{" "}
                      {preview.reduce((s, d) => s + d.allocated_weight, 0).toLocaleString("fr-FR")} kg
                    </p>

                    <Tabs defaultValue="template">
                      <TabsList>
                        <TabsTrigger value="template">Aperçu modèle</TabsTrigger>
                        <TabsTrigger value="edit">Édition détaillée</TabsTrigger>
                      </TabsList>

                      <TabsContent value="template">
                        {!selectedTemplate ? (
                          <p className="text-sm text-muted-foreground py-6 text-center">
                            Sélectionnez un modèle actif dans « Modèle de chargement » pour afficher l'aperçu.
                          </p>
                        ) : (
                          <div className="max-h-[60vh] overflow-auto">
                            <TemplatePreview
                              title={selectedTemplate.title}
                              subtitle={selectedTemplate.subtitle}
                              slogan={selectedTemplate.slogan}
                              coop_logo_path={selectedTemplate.coop_logo_path}
                              partner_logo_path={selectedTemplate.partner_logo_path}
                              logo_position={selectedTemplate.logo_position}
                              custom_header={selectedTemplate.custom_header}
                              custom_footer={selectedTemplate.custom_footer}
                              show_driver={selectedTemplate.show_driver}
                              show_truck={selectedTemplate.show_truck}
                              show_trailer={selectedTemplate.show_trailer}
                              show_bill_of_lading={selectedTemplate.show_bill_of_lading}
                              show_destination={selectedTemplate.show_destination}
                              show_project={selectedTemplate.show_project}
                              show_partner={selectedTemplate.show_partner}
                              show_departure_date={selectedTemplate.show_departure_date}
                              show_num_bags={selectedTemplate.show_num_bags}
                              show_total_weight={selectedTemplate.show_total_weight}
                              show_num_producers={selectedTemplate.show_num_producers}
                              show_partner_logo={selectedTemplate.show_partner_logo}
                              coopName={cooperatives.find((c) => c.id === selectedCoopId)?.name}
                              data={{
                                driver: driverName || "—",
                                truck: truckNumber || "—",
                                trailer: trailerNumber || "—",
                                bill_of_lading: connaissement || "—",
                                destination: destination || "—",
                                project: projects.find((p) => p.id === project)?.name || "—",
                                partner: partners.find((p) => p.id === partnerId)?.name || "—",
                                departure_date: departureDate || "—",
                                num_bags: preview.reduce((s, d) => s + d.num_bags, 0),
                                total_weight: preview.reduce((s, d) => s + d.allocated_weight, 0).toLocaleString("fr-FR"),
                                num_producers: preview.length,
                                lot: "(auto)",
                                producers: preview.map((d) => ({
                                  name: d.full_name,
                                  receipt: d.receipt_number,
                                  section: d.section,
                                  plant: d.plantation_code,
                                  date: d.delivery_date,
                                  weight: Math.round(d.allocated_weight).toLocaleString("fr-FR"),
                                  bags: d.num_bags,
                                })),
                              } as TemplatePreviewData}
                            />
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="edit">
                        <div className="max-h-[60vh] overflow-auto">
                         <Table>
                             <TableHeader>
                              <TableRow>
                                <TableHead className="w-12">N°</TableHead>
                                <SortableHeader column="receipt" label="N° Reçu" sortConfig={sortConfig} onToggle={toggleSort} />
                                <SortableHeader column="name" label="Nom" sortConfig={sortConfig} onToggle={toggleSort} />
                                <SortableHeader column="code" label="Code plantation" sortConfig={sortConfig} onToggle={toggleSort} />
                                <SortableHeader column="section" label="Section" sortConfig={sortConfig} onToggle={toggleSort} />
                                <SortableHeader column="weight" label="Poids (kg)" sortConfig={sortConfig} onToggle={toggleSort} />
                                <SortableHeader column="bags" label="Sacs" sortConfig={sortConfig} onToggle={toggleSort} />
                                <SortableHeader column="date" label="Date" sortConfig={sortConfig} onToggle={toggleSort} />
                                <TableHead className="w-16">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sortData(preview, (d, col) => {
                                switch (col) {
                                  case "receipt": return d.receipt_number;
                                  case "name": return d.full_name;
                                  case "code": return d.plantation_code;
                                  case "section": return d.section;
                                  case "weight": return d.allocated_weight;
                                  case "bags": return d.num_bags;
                                  case "date": return d.delivery_date;
                                  default: return null;
                                }
                              }).map((d, index) => {
                                const originalIndex = preview.indexOf(d);
                                return (
                                <TableRow key={d.receipt_number}>
                                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                                  <TableCell className="font-mono text-xs">{d.receipt_number}</TableCell>
                                  <TableCell>{d.full_name}</TableCell>
                                  <TableCell className="font-mono text-xs">{d.plantation_code}</TableCell>
                                  <TableCell>{d.section}</TableCell>
                                  {editingIndex === originalIndex ? (
                                    <>
                                      <TableCell>
                                        <Input type="number" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} className="h-7 w-20" />
                                      </TableCell>
                                      <TableCell>
                                        <Input type="number" value={editBags} onChange={(e) => setEditBags(e.target.value)} className="h-7 w-16" />
                                      </TableCell>
                                    </>
                                  ) : (
                                    <>
                                      <TableCell>{Math.round(d.allocated_weight).toLocaleString("fr-FR")}</TableCell>
                                      <TableCell>{d.num_bags}</TableCell>
                                    </>
                                  )}
                                  <TableCell>{d.delivery_date}</TableCell>
                                  <TableCell>
                                    {editingIndex === originalIndex ? (
                                      <div className="flex gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSaveEdit(originalIndex)}>
                                          <Check className="h-3 w-3" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancelEdit}>
                                          <X className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStartEdit(originalIndex)}>
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <ShipmentHistory />
        </TabsContent>

        <TabsContent value="details">
          <ShipmentDetails />
        </TabsContent>

        <TabsContent value="import">
          <ImportShipments />
        </TabsContent>
      </Tabs>
    </div>
  );
}
