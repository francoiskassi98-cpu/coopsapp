import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface Row {
  id: string;
  type_rapport: string;
  campaign_name: string | null;
  cooperatives: string[];
  file_name: string;
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  campaign: "Campagne",
  cooperative: "Registre",
  shipments: "Chargements",
  tracability: "Traçabilité",
  eudr: "EUDR",
};

export default function ReportHistory({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase.from("reports_ppt_history") as any)
          .select("id, type_rapport, campaign_name, cooperatives, file_name, created_at")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        setRows((data ?? []) as Row[]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshKey]);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Historique des rapports générés</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun rapport généré pour le moment.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Campagne</TableHead>
                <TableHead>Registres</TableHead>
                <TableHead>Fichier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString("fr-FR")}</TableCell>
                  <TableCell><Badge variant="outline">{TYPE_LABEL[r.type_rapport] ?? r.type_rapport}</Badge></TableCell>
                  <TableCell>{r.campaign_name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.cooperatives.length === 0 ? "Toutes" : r.cooperatives.join(", ")}</TableCell>
                  <TableCell className="text-xs font-mono">{r.file_name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
