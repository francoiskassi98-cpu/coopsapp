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
import { Pencil, Package, Users, Weight, Truck } from "lucide-react";

interface ShipmentWithDetails {
  id: string;
  connaissement: string | null;
  zone: string | null;
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
}

export default function ShipmentDetails() {
  const [shipments, setShipments] = useState<ShipmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingShipment, setEditingShipment] = useState<ShipmentWithDetails | null>(null);
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editZone, setEditZone] = useState("");
  const [editProject, setEditProject] = useState("");
  const [editDestination, setEditDestination] = useState("");
  const [editPartnerId, setEditPartnerId] = useState("");
  const [editConnaissement, setEditConnaissement] = useState("");
  const [editTotalWeight, setEditTotalWeight] = useState("");
  const [editTotalBags, setEditTotalBags] = useState("");

  const fetchAll = async () => {
    setLoading(true);
    try {
      // Fetch all shipments without limit
      let allShipments: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("shipments")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allShipments = allShipments.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      // Fetch all partners
      const { data: partnersData } = await supabase.from("partners").select("id, name");
      const partnerMap = new Map((partnersData || []).map((p) => [p.id, p.name]));
      setPartners(partnersData || []);

      // Fetch producer counts per shipment (all deliveries)
      let allDeliveries: any[] = [];
      from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("deliveries")
          .select("shipment_id, producer_id")
          .range(from, from + pageSize - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        allDeliveries = allDeliveries.concat(data);
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
        total_weight: Number(s.total_weight),
        total_bags: Number(s.total_bags),
        project: s.project,
        destination: s.destination,
        campaign: s.campaign,
        partner_id: s.partner_id,
        partner_name: s.partner_id ? partnerMap.get(s.partner_id) || "—" : "—",
        producer_count: producerCountMap.get(s.id)?.size || 0,
        status: s.status,
        delivery_start: s.delivery_start,
        delivery_end: s.delivery_end,
      }));

      setShipments(enriched);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openEdit = (s: ShipmentWithDetails) => {
    setEditingShipment(s);
    setEditZone(s.zone || "");
    setEditProject(s.project);
    setEditDestination(s.destination);
    setEditPartnerId(s.partner_id || "");
    setEditConnaissement(s.connaissement || "");
    setEditTotalWeight(String(s.total_weight));
    setEditTotalBags(String(s.total_bags));
  };

  const handleSaveEdit = async () => {
    if (!editingShipment) return;
    setSaving(true);
    try {
      const weight = Number(editTotalWeight);
      const bags = Number(editTotalBags);
      const { error } = await supabase
        .from("shipments")
        .update({
          connaissement: editConnaissement || null,
          zone: editZone || null,
          total_weight: weight,
          total_bags: bags,
          avg_bag_weight: bags > 0 ? weight / bags : 0,
          project: editProject,
          destination: editDestination,
          partner_id: editPartnerId || null,
        })
        .eq("id", editingShipment.id);

      if (error) throw error;
      toast({ title: "Chargement modifié" });
      setEditingShipment(null);
      fetchAll();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
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
                    <TableHead>Zone</TableHead>
                    <TableHead>Poids total (kg)</TableHead>
                    <TableHead>Producteurs</TableHead>
                    <TableHead>Sacs</TableHead>
                    <TableHead>Projet</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Partenaire</TableHead>
                    <TableHead>Campagne</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipments.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.connaissement || "—"}</TableCell>
                      <TableCell>{s.zone || "—"}</TableCell>
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
                      <TableCell>
                        <Badge variant={s.status === "active" ? "default" : "secondary"} className="text-xs">
                          {s.status === "active" ? "Actif" : s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
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
              <Label>Zone</Label>
              <Input value={editZone} onChange={(e) => setEditZone(e.target.value)} placeholder="Nom de la coopérative" />
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

            <Button onClick={handleSaveEdit} disabled={saving} className="w-full">
              {saving ? "Enregistrement..." : "Enregistrer les modifications"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
