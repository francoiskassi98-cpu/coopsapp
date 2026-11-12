import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, RotateCcw, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type TableKey = "cooperatives" | "producers" | "shipments" | "partners";

/** Colonnes communes affichées dans la corbeille (tables hétérogènes). */
type TrashRow = {
  id: string;
  deleted_at: string | null;
  name?: string | null;
  full_name?: string | null;
  lot_number?: string | null;
  connaissement?: string | null;
};

/** Chargement archivé avec son snapshot de livraisons. */
type TrashedDelivery = {
  producer_id: string;
  receipt_number: string | null;
  delivery_date: string | null;
  net_weight: number;
  num_bags: number;
};

type TrashedShipment = TrashRow & {
  campaign_label: string | null;
  destination: string;
  project: string;
  delivery_start: string;
  delivery_end: string;
  departure_date: string | null;
  driver_name: string | null;
  truck_number: string | null;
  trailer_number: string | null;
  total_weight: number;
  total_bags: number;
  avg_bag_weight: number;
  trashed_deliveries: TrashedDelivery[] | null;
};

const labels: Record<TableKey, string> = {
  cooperatives: "Coopératives",
  producers: "Producteurs",
  shipments: "Chargements",
  partners: "Partenaires",
};

/**
 * Les 4 tables de la corbeille partagent `id` et `deleted_at`.
 * On s'appuie sur le typage d'une table représentative pour garder un
 * query builder typé malgré le nom de table dynamique.
 */
const trashTable = (t: TableKey) => supabase.from(t as "partners");

export default function Trash() {
  const [tab, setTab] = useState<TableKey>("cooperatives");
  const [rows, setRows] = useState<TrashRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<TrashedShipment | null>(null);
  const [producerNames, setProducerNames] = useState<Record<string, string>>({});

  const openDetail = async (row: TrashRow) => {
    const s = row as unknown as TrashedShipment;
    setDetail(s);
    const ids = [...new Set((s.trashed_deliveries ?? []).map((d) => d.producer_id))];
    if (ids.length === 0) { setProducerNames({}); return; }
    const { data } = await supabase
      .from("producers")
      .select("id, last_name, first_name, plantation_code")
      .in("id", ids);
    const map: Record<string, string> = {};
    (data ?? []).forEach((p) => {
      map[p.id] = [p.last_name, p.first_name].filter(Boolean).join(" ") || p.plantation_code || p.id.slice(0, 8);
    });
    setProducerNames(map);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await trashTable(tab)
      .select("*")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error(error);
      toast.error("Une erreur est survenue.");
    }
    setRows((data ?? []) as TrashRow[]);
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const restore = async (id: string) => {
    const { error } = tab === "shipments"
      ? await supabase.rpc("restore_shipment", { _shipment_id: id })
      : await trashTable(tab).update({ deleted_at: null }).eq("id", id);
    if (error) { console.error(error); toast.error("Une erreur est survenue."); return; }
    toast.success("Élément restauré");
    load();
  };

  const purge = async (id: string) => {
    if (!confirm("Suppression définitive ?")) return;
    const { error } = await trashTable(tab).delete().eq("id", id);
    if (error) { console.error(error); toast.error("Une erreur est survenue."); return; }
    toast.success("Supprimé définitivement");
    load();
  };


  const titleField = (r: TrashRow) =>
    r.name || r.full_name || r.lot_number || r.connaissement || r.id?.slice(0, 8);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={Trash2}
        title="Corbeille"
        description="Restaurer ou supprimer définitivement les éléments archivés."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TableKey)}>
        <TabsList>
          {(Object.keys(labels) as TableKey[]).map((k) => (
            <TabsTrigger key={k} value={k}>{labels[k]}</TabsTrigger>
          ))}
        </TabsList>
        {(Object.keys(labels) as TableKey[]).map((k) => (
          <TabsContent key={k} value={k} className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{labels[k]} archivés</CardTitle></CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Aucun élément archivé.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Élément</TableHead>
                        <TableHead>Archivé le</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{titleField(r)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {r.deleted_at ? new Date(r.deleted_at).toLocaleString("fr-FR") : "—"}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {tab === "shipments" && (
                              <Button variant="outline" size="sm" onClick={() => openDetail(r)}>
                                <Eye className="h-3 w-3 mr-1" /> Détails
                              </Button>
                            )}
                             <Button variant="outline" size="sm" onClick={() => restore(r.id)}>
                              <RotateCcw className="h-3 w-3 mr-1" /> Restaurer
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => purge(r.id)}>
                              <Trash2 className="h-3 w-3 mr-1" /> Supprimer
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détail du chargement archivé</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div><p className="text-muted-foreground">N° de lot</p><p className="font-medium">{detail.lot_number || "Non renseigné"}</p></div>
                <div><p className="text-muted-foreground">Connaissement</p><p className="font-medium">{detail.connaissement || "Non renseigné"}</p></div>
                <div><p className="text-muted-foreground">Campagne</p><p className="font-medium">{detail.campaign_label || "Non renseigné"}</p></div>
                <div><p className="text-muted-foreground">Projet</p><p className="font-medium">{detail.project || "Non renseigné"}</p></div>
                <div><p className="text-muted-foreground">Destination</p><p className="font-medium">{detail.destination || "Non renseigné"}</p></div>
                <div><p className="text-muted-foreground">Période de livraison</p><p className="font-medium">{detail.delivery_start} → {detail.delivery_end}</p></div>
                <div><p className="text-muted-foreground">Départ</p><p className="font-medium">{detail.departure_date || "Non renseigné"}</p></div>
                <div><p className="text-muted-foreground">Chauffeur</p><p className="font-medium">{detail.driver_name || "Non renseigné"}</p></div>
                <div><p className="text-muted-foreground">Camion / Remorque</p><p className="font-medium">{[detail.truck_number, detail.trailer_number].filter(Boolean).join(" / ") || "Non renseigné"}</p></div>
                <div><p className="text-muted-foreground">Poids total</p><p className="font-medium">{detail.total_weight.toLocaleString("fr-FR")} kg</p></div>
                <div><p className="text-muted-foreground">Sacs</p><p className="font-medium">{detail.total_bags.toLocaleString("fr-FR")}</p></div>
                <div><p className="text-muted-foreground">Poids moyen / sac</p><p className="font-medium">{detail.avg_bag_weight} kg</p></div>
              </div>

              <div>
                <p className="font-medium mb-2">Livraisons ({detail.trashed_deliveries?.length ?? 0})</p>
                {detail.trashed_deliveries && detail.trashed_deliveries.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producteur</TableHead>
                        <TableHead>Reçu</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Poids net (kg)</TableHead>
                        <TableHead className="text-right">Sacs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.trashed_deliveries.map((d, i) => (
                        <TableRow key={i}>
                          <TableCell>{producerNames[d.producer_id] || d.producer_id.slice(0, 8)}</TableCell>
                          <TableCell>{d.receipt_number || "—"}</TableCell>
                          <TableCell>{d.delivery_date || "—"}</TableCell>
                          <TableCell className="text-right">{Number(d.net_weight).toLocaleString("fr-FR")}</TableCell>
                          <TableCell className="text-right">{d.num_bags}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-muted-foreground">Aucune livraison enregistrée dans cet archivage.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
