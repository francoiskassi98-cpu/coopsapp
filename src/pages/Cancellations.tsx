import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { XCircle, History, ShipIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Cancellations() {
  const [shipments, setShipments] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [{ data: active }, { data: cancelled }, { count: totalActive }] = await Promise.all([
      supabase.from("shipments").select("id, connaissement, total_weight, total_bags").eq("is_cancelled", false).not("connaissement", "is", null).order("created_at", { ascending: false }),
      supabase.from("cancellations").select("*").order("cancelled_at", { ascending: false }),
      supabase.from("shipments").select("id", { count: "exact", head: true }).eq("is_cancelled", false),
    ]);
    setShipments(active || []);
    setHistory(cancelled || []);
    setActiveCount(totalActive || 0);
  }

  const handleCancel = async () => {
    if (!selectedId) return;
    setCancelling(true);

    try {
      const { error } = await (supabase as any).rpc("cancel_shipment", {
        p_shipment_id: selectedId,
        p_reason: reason || null,
      });

      if (error) throw error;

      const shipment = shipments.find((s) => s.id === selectedId);
      toast({ title: "Chargement annulé", description: `Le connaissement ${shipment?.connaissement} a été annulé. Aucune donnée n'a été supprimée.` });
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

      {/* Indicateurs */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ShipIcon className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Connaissements actifs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-2xl font-bold">{history.length}</p>
              <p className="text-xs text-muted-foreground">Connaissements annulés</p>
            </div>
          </CardContent>
        </Card>
      </div>

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
          <p className="text-xs text-muted-foreground">
            ⚠️ Aucune donnée ne sera supprimée. Le chargement sera marqué comme annulé et archivé.
          </p>
          <Button variant="destructive" onClick={handleCancel} disabled={!selectedId || cancelling} className="w-full">
            {cancelling ? "Annulation en cours..." : "Annuler le chargement"}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Historique des annulations ({history.length})
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
