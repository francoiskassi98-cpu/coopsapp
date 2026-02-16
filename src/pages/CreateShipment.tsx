import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { distributeShipment, getCurrentCampaign, type DistributionResult } from "@/lib/shipment-utils";
import { toast } from "@/hooks/use-toast";
import { Truck, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ImportShipments from "@/pages/ImportShipments";
import ShipmentDetails from "@/components/ShipmentDetails";

export default function CreateShipment() {
  const [totalWeight, setTotalWeight] = useState("");
  const [totalBags, setTotalBags] = useState("");
  const [connaissement, setConnaissement] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [project, setProject] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [zone, setZone] = useState("");
  const [destination, setDestination] = useState("");
  const [campaign, setCampaign] = useState("Principale");
  const [partners, setPartners] = useState<any[]>([]);
  const [newPartnerName, setNewPartnerName] = useState("");
  const [preview, setPreview] = useState<DistributionResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    supabase.from("partners").select("*").order("name").then(({ data }) => setPartners(data || []));
  }, []);

  const handleCalculate = async () => {
    if (!totalWeight || !totalBags || !startDate || !endDate || !project || !destination) {
      toast({ title: "Champs requis manquants", description: "Veuillez remplir tous les champs obligatoires.", variant: "destructive" });
      return;
    }

    const { data: producers } = await supabase
      .from("producers")
      .select("id, full_name, section, plantation_code, remaining_potential")
      .gt("remaining_potential", 0)
      .order("section");

    if (!producers || producers.length === 0) {
      toast({ title: "Aucun producteur disponible", description: "Importez d'abord des producteurs avec un potentiel restant.", variant: "destructive" });
      return;
    }

    const { data: lastReceipt } = await supabase
      .from("deliveries")
      .select("receipt_number")
      .order("receipt_number", { ascending: false })
      .limit(1);

    const lastNum = lastReceipt && lastReceipt.length > 0 ? parseInt(lastReceipt[0].receipt_number, 10) : 0;

    const results = distributeShipment(
      producers.map((p) => ({ ...p, remaining_potential: Number(p.remaining_potential) })),
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

  const handleSave = async () => {
    if (preview.length === 0) return;
    setSaving(true);

    try {
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
          destination,
          campaign: `${campaign} ${getCurrentCampaign()}`,
          delivery_start: startDate,
          delivery_end: endDate,
        })
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

      const { error: delErr } = await supabase.from("deliveries").insert(deliveries);
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

      toast({ title: "Chargement créé", description: `${preview.length} fiches de livraison générées.` });
      setPreview([]);
      setConnaissement("");
      setTotalWeight("");
      setTotalBags("");
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addPartner = async () => {
    if (!newPartnerName.trim()) return;
    const { data, error } = await supabase.from("partners").insert({ name: newPartnerName.trim() }).select().single();
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setPartners([...partners, data]);
      setPartnerId(data.id);
      setNewPartnerName("");
      setDialogOpen(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Truck className="h-6 w-6" /> Chargements
      </h1>

      <Tabs defaultValue="create">
        <TabsList>
          <TabsTrigger value="create">Créer un chargement</TabsTrigger>
          <TabsTrigger value="details">Détail des chargements</TabsTrigger>
          <TabsTrigger value="import">Importer les anciens chargements</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paramètres du chargement</CardTitle>
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
                  <Label>N° Connaissement (optionnel)</Label>
                  <Input value={connaissement} onChange={(e) => setConnaissement(e.target.value)} />
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
                  <Label>Zone</Label>
                  <Input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Nom de la coopérative" />
                </div>

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

                <Button onClick={handleCalculate} className="w-full">Calculer la distribution</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Aperçu du chargement</CardTitle>
                  {preview.length > 0 && (
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? "Enregistrement..." : "Valider et enregistrer"}
                    </Button>
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
                    <div className="max-h-[60vh] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>N° Reçu</TableHead>
                            <TableHead>Nom</TableHead>
                            <TableHead>Section</TableHead>
                            <TableHead>Poids (kg)</TableHead>
                            <TableHead>Sacs</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.map((d) => (
                            <TableRow key={d.receipt_number}>
                              <TableCell className="font-mono text-xs">{d.receipt_number}</TableCell>
                              <TableCell>{d.full_name}</TableCell>
                              <TableCell>{d.section}</TableCell>
                              <TableCell>{d.allocated_weight.toLocaleString("fr-FR")}</TableCell>
                              <TableCell>{d.num_bags}</TableCell>
                              <TableCell>{d.delivery_date}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
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
