import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";

type TableKey = "cooperatives" | "producers" | "shipments" | "partners";

const labels: Record<TableKey, string> = {
  cooperatives: "Coopératives",
  producers: "Producteurs",
  shipments: "Chargements",
  partners: "Partenaires",
};

export default function Trash() {
  const [tab, setTab] = useState<TableKey>("cooperatives");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from(tab) as any)
      .select("*")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error(error);
      toast.error("Une erreur est survenue.");
    }
    setRows((data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tab]);

  const restore = async (id: string) => {
    const { error } = await (supabase.from(tab) as any).update({ deleted_at: null }).eq("id", id);
    if (error) { console.error(error); toast.error("Une erreur est survenue."); return; }
    toast.success("Élément restauré");
    load();
  };

  const purge = async (id: string) => {
    if (!confirm("Suppression définitive ?")) return;
    const { error } = await (supabase.from(tab) as any).delete().eq("id", id);
    if (error) { console.error(error); toast.error("Une erreur est survenue."); return; }
    toast.success("Supprimé définitivement");
    load();
  };

  const titleField = (r: any) =>
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
    </div>
  );
}
