import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { XCircle, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Cancellations() {
  const [shipments, setShipments] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data: active } = await supabase.from("shipments").select("id, connaissement, total_weight, total_bags").eq("status", "active").not("connaissement", "is", null).order("created_at", { ascending: false });
    setShipments(active || []);

    const { data: cancelled } = await supabase.from("cancellations").select("*").order("cancelled_at", { ascending: false });
    setHistory(cancelled || []);
  }

  const handleCancel = async () => {
    if (!selectedId) return;
    setCancelling(true);

    try {
      const shipment = shipments.find((s) => s.id === selectedId);
      if (!shipment) throw new Error("Chargement introuvable");

      // Get all deliveries for this shipment
      const { data: deliveries } = await supabase.from("deliveries").select("producer_id, net_weight").eq("shipment_id", selectedId);

      // Restore potentials
      if (deliveries) {
        for (const d of deliveries) {
          const { data: producer } = await supabase.from("producers").select("remaining_potential").eq("id", d.producer_id).single();
          if (producer) {
            await supabase.from("producers").update({
              remaining_potential: Number(producer.remaining_potential) + Number(d.net_weight),
            }).eq("id", d.producer_id);
          }
        }
      }

      // Delete deliveries
      await supabase.from("deliveries").delete().eq("shipment_id", selectedId);

      // Update shipment status
      await supabase.from("shipments").update({ status: "cancelled" }).eq("id", selectedId);

      // Log cancellation
      await supabase.from("cancellations").insert({
        shipment_id: selectedId,
        connaissement: shipment.connaissement,
        total_weight: shipment.total_weight,
        total_bags: shipment.total_bags,
        reason: reason || null,
      });

      toast({ title: "Chargement annulé", description: `Le connaissement ${shipment.connaissement} a été annulé. Les potentiels ont été restaurés.` });
      setSelectedId("");
      setReason("");
      loadData();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <XCircle className="h-6 w-6" /> Annulation de chargement
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Annuler un chargement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Connaissement à annuler</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger><SelectValue placeholder="Sélectionner un connaissement" /></SelectTrigger>
              <SelectContent>
                {shipments.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.connaissement} — {Number(s.total_weight).toLocaleString("fr-FR")} kg
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Raison (optionnel)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Raison de l'annulation" />
          </div>
          <Button variant="destructive" onClick={handleCancel} disabled={!selectedId || cancelling} className="w-full">
            {cancelling ? "Annulation en cours..." : "Annuler le chargement"}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Historique des annulations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Connaissement</TableHead>
                <TableHead>Poids (kg)</TableHead>
                <TableHead>Sacs</TableHead>
                <TableHead>Raison</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">Aucune annulation</TableCell>
                </TableRow>
              ) : (
                history.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.connaissement}</TableCell>
                    <TableCell>{Number(c.total_weight).toLocaleString("fr-FR")}</TableCell>
                    <TableCell>{c.total_bags}</TableCell>
                    <TableCell>{c.reason || "—"}</TableCell>
                    <TableCell>{new Date(c.cancelled_at).toLocaleDateString("fr-FR")}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
