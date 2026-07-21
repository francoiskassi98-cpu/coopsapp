import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, History } from "lucide-react";
import { toast } from "sonner";
import { useSortableTable, SortableHeader } from "@/hooks/useSortableTable";
import { useActiveRegistre } from "@/hooks/useActiveRegistre";

export default function ShipmentHistory() {
  const { active, registres } = useActiveRegistre();
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRegistre, setSelectedRegistre] = useState("all");

  async function fetchAllRows(query: any) {
    let all: any[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }

  async function loadData() {
    if (!active) { setShipments([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await fetchAllRows(
        (supabase.from as any)("shipments")
          .select("*, partners(name), registres(name, cooperatives(name))")
          .eq("registre_id", active.id)
          .order("created_at", { ascending: false })
      );
      setShipments(data);
    } catch (e) {
      console.error(e);
      toast.error("Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [active?.id]);

  const { sortConfig, toggleSort, sortData } = useSortableTable();

  const filtered = useMemo(() => {
    const base = shipments.filter((s) => {
      const registreName = (s.registres as any)?.name || "";
      const matches = selectedRegistre === "all" || registreName === selectedRegistre;
      const matchesSearch =
        !search ||
        s.connaissement?.toLowerCase().includes(search.toLowerCase()) ||
        (s.partners as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
        registreName.toLowerCase().includes(search.toLowerCase());
      return matches && matchesSearch;
    });
    return sortData(base, (item: any, col: string) => {
      if (col === "total_weight" || col === "total_bags") return Number(item[col]);
      if (col === "partner") return (item.partners as any)?.name || "";
      if (col === "registre") return (item.registres as any)?.name || "";
      if (col === "created_at") return new Date(item[col]).getTime();
      return item[col];
    });
  }, [shipments, selectedRegistre, search, sortConfig]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-5 w-5" /> Historique — {active?.name ?? "(Aucun registre)"} ({filtered.length})
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedRegistre} onValueChange={setSelectedRegistre}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Tous les registres" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {registres.map((r) => (
                  <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
            <Button variant="outline" size="sm" onClick={() => loadData()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Chargement...</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader column="connaissement" label="Connaissement" sortConfig={sortConfig} onToggle={toggleSort} />
                  <SortableHeader column="project" label="Projet" sortConfig={sortConfig} onToggle={toggleSort} />
                  <SortableHeader column="partner" label="Partenaire" sortConfig={sortConfig} onToggle={toggleSort} />
                  <SortableHeader column="registre" label="Registre" sortConfig={sortConfig} onToggle={toggleSort} />
                  <SortableHeader column="destination" label="Destination" sortConfig={sortConfig} onToggle={toggleSort} />
                  <SortableHeader column="total_weight" label="Poids (kg)" sortConfig={sortConfig} onToggle={toggleSort} />
                  <SortableHeader column="total_bags" label="Sacs" sortConfig={sortConfig} onToggle={toggleSort} />
                  <SortableHeader column="created_at" label="Date" sortConfig={sortConfig} onToggle={toggleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Aucun chargement</TableCell></TableRow>
                ) : filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.connaissement || "—"}</TableCell>
                    <TableCell>{s.project}</TableCell>
                    <TableCell>{(s.partners as any)?.name || "—"}</TableCell>
                    <TableCell>{(s.registres as any)?.name || "—"}</TableCell>
                    <TableCell>{s.destination}</TableCell>
                    <TableCell>{Number(s.total_weight).toLocaleString("fr-FR")}</TableCell>
                    <TableCell>{s.total_bags}</TableCell>
                    <TableCell className="text-xs">{new Date(s.created_at).toLocaleDateString("fr-FR")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
