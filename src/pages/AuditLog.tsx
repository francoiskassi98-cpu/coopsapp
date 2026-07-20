import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, FileDown, Search, RefreshCw, ShieldCheck } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { fetchAllRows } from "@/lib/database-utils";
import { supabase } from "@/integrations/supabase/client";
import ExcelJS from "exceljs";

type AuditRow = {
  id: string;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_data: any;
  new_data: any;
  changed_by: string | null;
  changed_by_email: string | null;
  cooperative: string | null;
  campaign_id: string | null;
  changed_at: string;
};

const TABLES = [
  "producers", "producer_registry", "shipments", "deliveries",
  "campaigns", "user_cooperatives", "profiles",
];

const ACTION_COLOR: Record<string, string> = {
  INSERT: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  UPDATE: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DELETE: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

export default function AuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<{ id: string; nom: string }[]>([]);
  const [cooperatives, setCooperatives] = useState<string[]>([]);

  // filters
  const [fTable, setFTable] = useState<string>("all");
  const [fEmail, setFEmail] = useState<string>("");
  const [fCoop, setFCoop] = useState<string>("all");
  const [fCampaign, setFCampaign] = useState<string>("all");
  const [fFrom, setFFrom] = useState<string>("");
  const [fTo, setFTo] = useState<string>("");
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAllRows("audit_logs", "*", {
        order: { column: "changed_at", ascending: false },
        filters: (q) => {
          let qb = q;
          if (fTable !== "all") qb = qb.eq("table_name", fTable);
          if (fEmail.trim()) qb = qb.ilike("changed_by_email", `%${fEmail.trim()}%`);
          if (fCoop !== "all") qb = qb.eq("cooperative", fCoop);
          if (fCampaign !== "all") qb = qb.eq("campaign_id", fCampaign);
          if (fFrom) qb = qb.gte("changed_at", fFrom);
          if (fTo) qb = qb.lte("changed_at", `${fTo}T23:59:59`);
          return qb;
        },
      });
      setRows(data as AuditRow[]);
    } catch (e) {
      console.error(e);
      toast.error("Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [{ data: camps }, coops] = await Promise.all([
          (supabase.from as any)("campaigns").select("id, nom").order("date_debut", { ascending: false }),
          fetchAllRows("cooperatives", "name", { order: { column: "name" } }),
        ]);
        setCampaigns((camps ?? []) as any);
        setCooperatives(((coops as any[]) ?? []).map((c) => c.name));
      } catch (e) {
        console.error(e);
      }
    })();
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = async () => {
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Audit");
      ws.columns = [
        { header: "Date", key: "changed_at", width: 22 },
        { header: "Table", key: "table_name", width: 20 },
        { header: "Action", key: "action", width: 10 },
        { header: "ID enregistrement", key: "record_id", width: 38 },
        { header: "Utilisateur", key: "changed_by_email", width: 28 },
        { header: "Coopérative", key: "cooperative", width: 18 },
        { header: "Campagne", key: "campaign_id", width: 38 },
        { header: "Ancien", key: "old_data", width: 60 },
        { header: "Nouveau", key: "new_data", width: 60 },
      ];
      rows.forEach((r) =>
        ws.addRow({
          ...r,
          old_data: r.old_data ? JSON.stringify(r.old_data) : "",
          new_data: r.new_data ? JSON.stringify(r.new_data) : "",
        }),
      );
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `journal-audit-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast.error("Une erreur est survenue.");
    }
  };

  const campMap = useMemo(() => {
    const m = new Map<string, string>();
    campaigns.forEach((c) => m.set(c.id, c.nom));
    return m;
  }, [campaigns]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={ShieldCheck}
        title="Journal d'audit"
        description="Traçabilité complète des modifications."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Actualiser
            </Button>
            <Button size="sm" onClick={handleExport} disabled={!rows.length}>
              <FileDown className="h-4 w-4 mr-2" />
              Exporter Excel
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1">
              <Label>Table</Label>
              <Select value={fTable} onValueChange={setFTable}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {TABLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Utilisateur (email)</Label>
              <Input value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder="email" />
            </div>
            <div className="space-y-1">
              <Label>Coopérative</Label>
              <Select value={fCoop} onValueChange={setFCoop}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {cooperatives.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Campagne</Label>
              <Select value={fCampaign} onValueChange={setFCampaign}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Du</Label>
              <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Au</Label>
              <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={load} disabled={loading}>
              <Search className="h-4 w-4 mr-2" />
              Appliquer
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{rows.length} entrée{rows.length > 1 ? "s" : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Coopérative</TableHead>
                  <TableHead>Campagne</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(r)}
                  >
                    <TableCell className="whitespace-nowrap">{new Date(r.changed_at).toLocaleString("fr-FR")}</TableCell>
                    <TableCell>{r.table_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ACTION_COLOR[r.action]}>{r.action}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">{r.changed_by_email ?? "—"}</TableCell>
                    <TableCell>{r.cooperative ?? "—"}</TableCell>
                    <TableCell>{r.campaign_id ? (campMap.get(r.campaign_id) ?? r.campaign_id) : "—"}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[160px] truncate">{r.record_id ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {!rows.length && !loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Aucune entrée.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selected?.action} · {selected?.table_name}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div><span className="text-muted-foreground">Date : </span>{new Date(selected.changed_at).toLocaleString("fr-FR")}</div>
                <div><span className="text-muted-foreground">Utilisateur : </span>{selected.changed_by_email ?? "—"}</div>
                <div><span className="text-muted-foreground">Coopérative : </span>{selected.cooperative ?? "—"}</div>
                <div><span className="text-muted-foreground">Campagne : </span>{selected.campaign_id ? (campMap.get(selected.campaign_id) ?? selected.campaign_id) : "—"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">ID : </span><span className="font-mono">{selected.record_id ?? "—"}</span></div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="font-semibold mb-1">Ancien</div>
                  <pre className="text-xs bg-muted/40 rounded p-3 overflow-auto max-h-[50vh]">
                    {selected.old_data ? JSON.stringify(selected.old_data, null, 2) : "—"}
                  </pre>
                </div>
                <div>
                  <div className="font-semibold mb-1">Nouveau</div>
                  <pre className="text-xs bg-muted/40 rounded p-3 overflow-auto max-h-[50vh]">
                    {selected.new_data ? JSON.stringify(selected.new_data, null, 2) : "—"}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
