import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Pencil, Package, Users, Weight, Truck, FileSpreadsheet, Loader2 } from "lucide-react";

interface ShipmentRow {
  id: string;
  connaissement: string | null;
  zone: string | null;
  total_weight: number | string;
  total_bags: number | string;
  project: string;
  destination: string;
  campaign_label: string | null;
  partner_id: string | null;
  status: string;
  delivery_start: string;
  delivery_end: string;
  driver_name: string | null;
  truck_number: string | null;
  trailer_number: string | null;
  departure_date: string | null;
  registres?: { id: string; name: string; cooperative_id: string; cooperatives?: { name: string } | null } | null;
}

interface DeliveryRow {
  shipment_id: string;
  producer_id: string;
}

interface ShipmentWithDetails {
  id: string;
  connaissement: string | null;
  zone: string | null;
  cooperative_id: string | null;
  cooperative_name: string | null;
  total_weight: number;
  total_bags: number;
  project: string;
  destination: string;
  campaign: string;
  partner_id: string | null;
  partner_name: string | null;
  producer_count: number;
  status: string;
  delivery_start: string;
  delivery_end: string;
  driver_name: string | null;
  truck_number: string | null;
  trailer_number: string | null;
  departure_date: string | null;
}

export default function ShipmentDetails() {
  const [shipments, setShipments] = useState<ShipmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingShipment, setEditingShipment] = useState<ShipmentWithDetails | null>(null);
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
  const [cooperativesList, setCooperativesList] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const handleGenerateFiche = async (id: string) => {
    setGeneratingId(id);
    try {
      const { generateShipmentFiche } = await import("@/services/excel/shipment-fiche-excel");
      await generateShipmentFiche(id);
      toast({ title: "Fiche générée" });
    } catch (e) {
      console.error(e);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    }
    } finally {
      setGeneratingId(null);
    }
  };

  // Edit form state
  const [editCoopId, setEditCoopId] = useState("");
  const [editProject, setEditProject] = useState("");
  const [editDestination, setEditDestination] = useState("");
  const [editPartnerId, setEditPartnerId] = useState("");
  const [editConnaissement, setEditConnaissement] = useState("");
  const [editTotalWeight, setEditTotalWeight] = useState("");
  const [editTotalBags, setEditTotalBags] = useState("");
  const [editDriver, setEditDriver] = useState("");
  const [editTruck, setEditTruck] = useState("");
  const [editTrailer, setEditTrailer] = useState("");
  const [editDeparture, setEditDeparture] = useState("");

  const fetchAll = async () => {
    setLoading(true);
    try {
      // Fetch all shipments without limit
      let allShipments: ShipmentRow[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("shipments")
          .select("*, registres(id, name, cooperative_id, cooperatives(name))")
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allShipments = allShipments.concat(data as unknown as ShipmentRow[]);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      // Fetch all partners
      const { data: partnersData } = await supabase.from("partners").select("id, name");
      const partnerMap = new Map((partnersData || []).map((p) => [p.id, p.name]));
      setPartners(partnersData || []);

      // Fetch registres (used as "Registre" selector in edit)
      const { data: coopsData } = await supabase.from("registres").select("id, name").order("name");
      setCooperativesList(coopsData || []);

      // Fetch producer counts per shipment (all deliveries)
      let allDeliveries: DeliveryRow[] = [];
      from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("deliveries")
          .select("shipment_id, producer_id")
          .range(from, from + pageSize - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        allDeliveries = allDeliveries.concat(data as DeliveryRow[]);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      const producerCountMap = new Map<string, Set<string>>();
      for (const d of allDeliveries) {
        if (!producerCountMap.has(d.shipment_id)) producerCountMap.set(d.shipment_id, new Set());
        producerCountMap.get(d.shipment_id)!.add(d.producer_id);
      }

      const enriched: ShipmentWithDetails[] = allShipments.map((s) => ({
        id: s.id,
        connaissement: s.connaissement,
        zone: s.zone,
        cooperative_id: s.registres?.id || null,
        cooperative_name: s.registres?.name || s.zone || null,
        total_weight: Number(s.total_weight),
        total_bags: Number(s.total_bags),
        project: s.project,
        destination: s.destination,
        campaign: s.campaign_label || "",
        partner_id: s.partner_id,
        partner_name: s.partner_id ? partnerMap.get(s.partner_id) || "—" : "—",
        producer_count: producerCountMap.get(s.id)?.size || 0,
        status: s.status,
        delivery_start: s.delivery_start,
        delivery_end: s.delivery_end,
        driver_name: s.driver_name,
        truck_number: s.truck_number,
        trailer_number: s.trailer_number,
        departure_date: s.departure_date,
      }));

      setShipments(enriched);
    } catch (err) {
      console.error(err);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openEdit = (s: ShipmentWithDetails) => {
    setEditingShipment(s);
    setEditCoopId(s.cooperative_id || "");
    setEditProject(s.project);
    setEditDestination(s.destination);
    setEditPartnerId(s.partner_id || "");
    setEditConnaissement(s.connaissement || "");
    setEditTotalWeight(String(s.total_weight));
    setEditTotalBags(String(s.total_bags));
    setEditDriver(s.driver_name || "");
    setEditTruck(s.truck_number || "");
    setEditTrailer(s.trailer_number || "");
    setEditDeparture(s.departure_date || "");
  };

  const handleSaveEdit = async () => {
    if (!editingShipment) return;
    setSaving(true);
    try {
      const weight = Number(editTotalWeight);
      const bags = Number(editTotalBags);
      const coopName = cooperativesList.find(c => c.id === editCoopId)?.name || null;
      const { error } = await supabase
        .from("shipments")
        .update({
          connaissement: editConnaissement || null,
          zone: coopName,
          registre_id: editCoopId || null,
          total_weight: weight,
          total_bags: bags,
          avg_bag_weight: bags > 0 ? weight / bags : 0,
          project: editProject,
          destination: editDestination,
          partner_id: editPartnerId || null,
          driver_name: editDriver.trim() || null,
          truck_number: editTruck.trim() || null,
          trailer_number: editTrailer.trim() || null,
          departure_date: editDeparture || null,
        })
        .eq("id", editingShipment.id);

      if (error) throw error;
      toast({ title: "Chargement modifié" });
      setEditingShipment(null);
      fetchAll();
    } catch (err) {
      console.error(err);
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-5 w-5" /> Liste des chargements ({shipments.length})
            </CardTitle>
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              Actualiser
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Chargement des données...</p>
          ) : shipments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Aucun chargement trouvé.</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Connaissement</TableHead>
                    <TableHead>Registre</TableHead>
                    <TableHead>Poids total (kg)</TableHead>
                    <TableHead>Producteurs</TableHead>
                    <TableHead>Sacs</TableHead>
                    <TableHead>Projet</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Partenaire</TableHead>
                    <TableHead>Campagne</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipments.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.connaissement || "—"}</TableCell>
                      <TableCell>{s.cooperative_name || "—"}</TableCell>
                      <TableCell className="font-semibold">{s.total_weight.toLocaleString("fr-FR")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          {s.producer_count}
                        </div>
                      </TableCell>
                      <TableCell>{s.total_bags}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{s.project}</Badge>
                      </TableCell>
                      <TableCell>{s.destination}</TableCell>
                      <TableCell>{s.partner_name}</TableCell>
                      <TableCell className="text-xs">{s.campaign}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Télécharger la fiche d'accompagnement"
                            disabled={generatingId === s.id}
                            onClick={() => handleGenerateFiche(s.id)}
                          >
                            {generatingId === s.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FileSpreadsheet className="h-4 w-4" />
                            )}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>


      {/* Edit Dialog */}
      <Dialog open={!!editingShipment} onOpenChange={(open) => !open && setEditingShipment(null)}>

        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" /> Modifier le chargement
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>N° Connaissement</Label>
              <Input value={editConnaissement} onChange={(e) => setEditConnaissement(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Weight className="h-3 w-3" /> Poids total (kg)</Label>
                <Input type="number" value={editTotalWeight} onChange={(e) => setEditTotalWeight(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Nombre de sacs</Label>
                <Input type="number" value={editTotalBags} onChange={(e) => setEditTotalBags(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Registre</Label>
              <Select value={editCoopId} onValueChange={setEditCoopId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un registre" /></SelectTrigger>
                <SelectContent>
                  {cooperativesList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Projet</Label>
              <Select value={editProject} onValueChange={setEditProject}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Fairtrade">Fairtrade</SelectItem>
                  <SelectItem value="Rainforest Alliance">Rainforest Alliance</SelectItem>
                  <SelectItem value="Ordinaire">Ordinaire</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Destination</Label>
              <Select value={editDestination} onValueChange={setEditDestination}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Abidjan">Abidjan</SelectItem>
                  <SelectItem value="San-Pedro">San-Pedro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Partenaire</Label>
              <Select value={editPartnerId} onValueChange={setEditPartnerId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Informations transport</p>
              <div className="space-y-2">
                <Label>Nom du chauffeur</Label>
                <Input value={editDriver} onChange={(e) => setEditDriver(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>N° Camion</Label>
                  <Input value={editTruck} onChange={(e) => setEditTruck(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>N° Remorque</Label>
                  <Input value={editTrailer} onChange={(e) => setEditTrailer(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Date départ</Label>
                <Input type="date" value={editDeparture} onChange={(e) => setEditDeparture(e.target.value)} />
              </div>
            </div>

            <Button onClick={handleSaveEdit} disabled={saving} className="w-full">
              {saving ? "Enregistrement..." : "Enregistrer les modifications"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
