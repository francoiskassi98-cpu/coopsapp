import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, FileDown, Search, RefreshCw, ScrollText, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentCampaign, campaignsBetween } from "@/lib/campaign";
import { useAuth } from "@/hooks/useAuth";
import { useRegistres } from "@/hooks/useRegistres";
import ExcelJS from "exceljs";

type AuditRow = {
  id: string;
  table_name: string;
  record_id: string | null;
  action: string;
  old_data: any;
  new_data: any;
  changed_by: string | null;
  changed_by_email: string | null;
  changed_by_role: string | null;
  registre: string | null;
  registre_id: string | null;
  cooperative_id: string | null;
  campaign_label: string | null;
  changed_at: string;
};

const TABLES = [
  "producers", "producer_registry", "shipments", "deliveries",
  "registres", "projects", "partners", "shipment_excel_templates",
  "producer_bonus_settings", "producer_bonus_results", "disabled_sections",
  "cooperatives", "subscriptions", "user_cooperatives", "user_roles", "profiles",
];

const ACTIONS = ["INSERT", "UPDATE", "DELETE", "DELETE_USER"];
const ROLES = ["super_admin", "coop_admin", "agent"];
const PAGE_SIZE = 50;

const ACTION_COLOR: Record<string, string> = {
  INSERT: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  UPDATE: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  DELETE: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  DELETE_USER: "bg-rose-500/15 text-rose-600 border-rose-500/30",
};

interface Filters {
  table: string;
  action: string;
  email: string;
  role: string;
  coop: string;
  registre: string;
  campaign: string;
  from: string;
  to: string;
}

const EMPTY: Filters = {
  table: "all", action: "all", email: "", role: "all",
  coop: "all", registre: "all", campaign: currentCampaign(), from: "", to: "",
};

export default function AuditLog() {
  const { isSuperAdmin } = useAuth();
  const { registres } = useRegistres();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const campaigns = useMemo(() => {
    const set = new Set(campaignsBetween());
    set.add(currentCampaign());
    return Array.from(set).sort().reverse();
  }, []);

  const { data: coops = [] } = useQuery({
    queryKey: ["audit", "cooperatives"],
    enabled: isSuperAdmin,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cooperatives").select("id,name").is("deleted_at", null).order("name");
      if (error) { console.error("[AuditLog.load] étape=cooperatives", error); return []; }
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const applyFilters = (q: any) => {
    let qb = q;
    if (filters.table !== "all") qb = qb.eq("table_name", filters.table);
    if (filters.action !== "all") qb = qb.eq("action", filters.action);
    if (filters.role !== "all") qb = qb.eq("changed_by_role", filters.role);
    if (filters.email.trim()) qb = qb.ilike("changed_by_email", `%${filters.email.trim()}%`);
    if (filters.coop !== "all") qb = qb.eq("cooperative_id", filters.coop);
    if (filters.registre !== "all") qb = qb.eq("registre_id", filters.registre);
    if (filters.campaign !== "all") qb = qb.eq("campaign_label", filters.campaign);
    if (filters.from) qb = qb.gte("changed_at", `${filters.from}T00:00:00`);
    if (filters.to) qb = qb.lte("changed_at", `${filters.to}T23:59:59`);
    return qb;
  };

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["audit-logs", filters, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const { data, error, count } = await applyFilters(
        (supabase as any).from("audit_logs").select("*", { count: "exact" }),
      )
        .order("changed_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error("[AuditLog.load] étape=select audit_logs", {
          code: error.code, message: error.message, details: error.details,
          hint: error.hint, filters, page,
        });
        throw new Error(`${error.message}${error.code ? ` (code ${error.code})` : ""}`);
      }
      return { rows: (data ?? []) as AuditRow[], count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  const coopName = (id: string | null) => coops.find((c) => c.id === id)?.name ?? null;

  const handleApply = () => { setFilters(draft); setPage(0); };
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    refetch();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const all: AuditRow[] = [];
      let from = 0;
      // Export paginé (max 10 000 lignes) pour ne pas saturer la mémoire.
      while (from < 10_000) {
        const { data, error } = await applyFilters(
          (supabase as any).from("audit_logs").select("*"),
        ).order("changed_at", { ascending: false }).range(from, from + 999);
        if (error) {
          console.error("[AuditLog.load] étape=export", error);
          throw new Error(error.message);
        }
        const batch = (data ?? []) as AuditRow[];
        all.push(...batch);
        if (batch.length < 1000) break;
        from += 1000;
      }

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Audit");
      ws.columns = [
        { header: "Date", key: "changed_at", width: 22 },
        { header: "Utilisateur", key: "changed_by_email", width: 28 },
        { header: "Rôle", key: "changed_by_role", width: 14 },
        { header: "Coopérative", key: "cooperative", width: 24 },
        { header: "Registre", key: "registre", width: 20 },
        { header: "Table", key: "table_name", width: 22 },
        { header: "Action", key: "action", width: 12 },
        { header: "ID enregistrement", key: "record_id", width: 38 },
        { header: "Campagne", key: "campaign_label", width: 14 },
        { header: "Ancien", key: "old_data", width: 60 },
        { header: "Nouveau", key: "new_data", width: 60 },
      ];
      all.forEach((r) =>
        ws.addRow({
          ...r,
          changed_at: new Date(r.changed_at).toLocaleString("fr-FR"),
          cooperative: coopName(r.cooperative_id) ?? "",
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
    } catch (e: any) {
      console.error("[AuditLog.load] export", e);
      toast.error(`Export impossible : ${e?.message ?? "erreur inconnue"}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={ScrollText}
        title="Journal d'audit"
        description="Traçabilité complète des modifications."
        actions={
          <>
            <Button variant="outline" onClick={handleRefresh} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Actualiser
            </Button>
            <Button onClick={handleExport} disabled={exporting || !total}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileDown className="h-4 w-4 mr-2" />}
              Exporter Excel
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Filtres</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
            <div className="space-y-1">
              <Label>Table</Label>
              <Select value={draft.table} onValueChange={(v) => setDraft({ ...draft, table: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {TABLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Action</Label>
              <Select value={draft.action} onValueChange={(v) => setDraft({ ...draft, action: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Utilisateur (email)</Label>
              <Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="email" />
            </div>
            <div className="space-y-1">
              <Label>Rôle</Label>
              <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {isSuperAdmin && (
              <div className="space-y-1">
                <Label>Coopérative</Label>
                <Select value={draft.coop} onValueChange={(v) => setDraft({ ...draft, coop: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    {coops.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Registre</Label>
              <Select value={draft.registre} onValueChange={(v) => setDraft({ ...draft, registre: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {registres.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Campagne</Label>
              <Select value={draft.campaign} onValueChange={(v) => setDraft({ ...draft, campaign: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {campaigns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Du</Label>
              <Input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Au</Label>
              <Input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setDraft(EMPTY); setFilters(EMPTY); setPage(0); }}>
              Réinitialiser
            </Button>
            <Button size="sm" onClick={handleApply} disabled={isFetching}>
              <Search className="h-4 w-4 mr-2" />
              Appliquer
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 flex items-start gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <div className="font-semibold text-destructive">Chargement du journal impossible</div>
              <div className="text-muted-foreground">{(error as Error).message}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            {total} entrée{total > 1 ? "s" : ""} · page {page + 1} / {maxPage + 1}
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" disabled={page === 0 || isFetching} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" disabled={page >= maxPage || isFetching} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Rôle</TableHead>
                  {isSuperAdmin && <TableHead>Coopérative</TableHead>}
                  <TableHead>Registre</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Campagne</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                    <TableCell className="whitespace-nowrap">{new Date(r.changed_at).toLocaleString("fr-FR")}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.changed_by_email ?? "—"}</TableCell>
                    <TableCell>{r.changed_by_role ?? "—"}</TableCell>
                    {isSuperAdmin && <TableCell>{coopName(r.cooperative_id) ?? "—"}</TableCell>}
                    <TableCell>{r.registre ?? "—"}</TableCell>
                    <TableCell>{r.table_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ACTION_COLOR[r.action]}>{r.action}</Badge>
                    </TableCell>
                    <TableCell>{r.campaign_label ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[140px] truncate">{r.record_id ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell colSpan={isSuperAdmin ? 9 : 8} className="text-center text-muted-foreground py-8">
                      {isFetching ? "Chargement…" : error ? "Journal indisponible." : "Aucune entrée pour ces filtres."}
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
            <DialogTitle>{selected?.action} · {selected?.table_name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div><span className="text-muted-foreground">Date : </span>{new Date(selected.changed_at).toLocaleString("fr-FR")}</div>
                <div><span className="text-muted-foreground">Utilisateur : </span>{selected.changed_by_email ?? "—"}</div>
                <div><span className="text-muted-foreground">Rôle : </span>{selected.changed_by_role ?? "—"}</div>
                <div><span className="text-muted-foreground">Coopérative : </span>{coopName(selected.cooperative_id) ?? "—"}</div>
                <div><span className="text-muted-foreground">Registre : </span>{selected.registre ?? "—"}</div>
                <div><span className="text-muted-foreground">Campagne : </span>{selected.campaign_label ?? "—"}</div>
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
