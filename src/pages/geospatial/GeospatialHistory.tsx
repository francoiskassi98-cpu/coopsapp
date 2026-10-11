import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import GeoStatusBadge from "@/components/geospatial/GeoStatusBadge";
import { STATUS_LABEL, formatBytes } from "@/lib/geospatial";

export default function GeospatialHistory() {
  const { isSuperAdmin } = useAuth();
  const [archived, setArchived] = useState("actifs");
  const [status, setStatus] = useState("all");
  const [coop, setCoop] = useState("all");
  const [format, setFormat] = useState("all");
  const [userQ, setUserQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["geo-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("geospatial_requests")
        .select("id,title,status,is_archived,created_at,created_by,cooperative_id,cooperatives(name),geospatial_files(detected_format,file_size_bytes,file_category)")
        .order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((r) => r.created_by)));
      const { data: profs } = ids.length ? await supabase.from("profiles").select("user_id,full_name,username,email").in("user_id", ids) : { data: [] };
      const pm = new Map((profs ?? []).map((p) => [p.user_id, p.full_name || p.username || p.email]));
      return (data ?? []).map((r) => ({ ...r, author: pm.get(r.created_by) ?? "—" }));
    },
  });

  const rows = data ?? [];
  const coops = useMemo(() => Array.from(new Map(rows.map((r) => [r.cooperative_id, (r.cooperatives as { name: string } | null)?.name ?? "—"])).entries()), [rows]);
  const formats = useMemo(() => Array.from(new Set(rows.flatMap((r) => r.geospatial_files.map((f) => f.detected_format)))).sort(), [rows]);

  const filtered = rows.filter((r) =>
    (archived === "archives" ? r.is_archived : !r.is_archived)
    && (status === "all" || r.status === status)
    && (coop === "all" || r.cooperative_id === coop)
    && (format === "all" || r.geospatial_files.some((f) => f.detected_format === format))
    && (!userQ || r.author.toLowerCase().includes(userQ.toLowerCase()))
    && (!from || r.created_at.slice(0, 10) >= from)
    && (!to || r.created_at.slice(0, 10) <= to));

  return (
    <div className="space-y-6">
      <PageHeader icon={History} title="Historique géospatial" description="Toutes les soumissions et leurs traitements." />
      <Card><CardContent className="p-4 space-y-3">
        <Tabs value={archived} onValueChange={setArchived}>
          <TabsList><TabsTrigger value="actifs">Actifs</TabsTrigger><TabsTrigger value="archives">Archivés</TabsTrigger></TabsList>
        </Tabs>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Statut"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous les statuts</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          {isSuperAdmin && (
            <Select value={coop} onValueChange={setCoop}>
              <SelectTrigger aria-label="Coopérative"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Toutes les coopératives</SelectItem>
                {coops.map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger aria-label="Format"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous les formats</SelectItem>
              {formats.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Utilisateur" value={userQ} onChange={(e) => setUserQ(e.target.value)} aria-label="Utilisateur" />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Du" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Au" />
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Demande</TableHead>{isSuperAdmin && <TableHead>Coopérative</TableHead>}
            <TableHead>Auteur</TableHead><TableHead>Date</TableHead><TableHead>Fichiers</TableHead><TableHead>Statut</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && [0, 1, 2].map((i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>)}
            {isError && <TableRow><TableCell colSpan={6} className="text-destructive">Une erreur est survenue.</TableCell></TableRow>}
            {!isLoading && !isError && filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Aucune demande trouvée.</TableCell></TableRow>}
            {filtered.map((r) => {
              const orig = r.geospatial_files.filter((f) => f.file_category === "original");
              return (
                <TableRow key={r.id}>
                  <TableCell><Link className="font-medium text-primary hover:underline" to={`/geospatial/${r.id}`}>{r.title}</Link></TableCell>
                  {isSuperAdmin && <TableCell>{(r.cooperatives as { name: string } | null)?.name}</TableCell>}
                  <TableCell>{r.author}</TableCell>
                  <TableCell className="whitespace-nowrap">{new Date(r.created_at).toLocaleString("fr-FR")}</TableCell>
                  <TableCell className="whitespace-nowrap">{orig.length} · {formatBytes(orig.reduce((s, f) => s + Number(f.file_size_bytes), 0))}</TableCell>
                  <TableCell><GeoStatusBadge status={r.status} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
