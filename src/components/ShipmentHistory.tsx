import { useCallback, useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, History } from "lucide-react";
import { toast } from "sonner";
import { useSortableTable, SortableHeader, type SortValue } from "@/hooks/useSortableTable";
import type { PaginatedQuery } from "@/lib/database-utils";

interface HistoryShipment {
  id: string;
  connaissement: string | null;
  lot_number: string | null;
  project: string | null;
  destination: string | null;
  total_weight: number | null;
  total_bags: number | null;
  created_at: string;
  zone: string | null;
  campaign_label: string | null;
  partners?: { name: string | null } | null;
  registres?: { name: string | null } | null;
}

async function fetchAllRows<T>(query: PaginatedQuery): Promise<T[]> {
  const allData: T[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    allData.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allData;
}

export default function ShipmentHistory() {
  const [shipments, setShipments] = useState<HistoryShipment[]>([]);
  const [cooperatives, setCooperatives] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCoop, setSelectedCoop] = useState("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [shipmentsData, coopsData] = await Promise.all([
        fetchAllRows<HistoryShipment>(
          supabase
            .from("shipments")
            .select("*, partners(name), registres(name)")
            .order("created_at", { ascending: false }) as unknown as PaginatedQuery
        ),
        supabase.from("registres").select("id, name").order("name"),
      ]);
      setShipments(shipmentsData);
      setCooperatives(coopsData.data || []);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { sortConfig, toggleSort, sortData } = useSortableTable();

  const filtered = useMemo(() => {
    const base = shipments.filter((s) => {
      const coopName = s.registres?.name || s.zone || "";
      const matchesCoop = selectedCoop === "all" || coopName === selectedCoop;
      const matchesSearch =
        !search ||
        s.connaissement?.toLowerCase().includes(search.toLowerCase()) ||
        s.partners?.name?.toLowerCase().includes(search.toLowerCase()) ||
        coopName.toLowerCase().includes(search.toLowerCase());
      return matchesCoop && matchesSearch;
    });
    return sortData(base, (item, col): SortValue => {
      if (col === "total_weight" || col === "total_bags") return Number(item[col as "total_weight" | "total_bags"]);
      if (col === "partner") return item.partners?.name || "";
      if (col === "cooperative") return item.registres?.name || item.zone || "";
      if (col === "created_at") return new Date(item.created_at).getTime();
      const v: unknown = (item as unknown as Record<string, unknown>)[col];
      if (v == null) return null;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
      return String(v);
    });
  }, [shipments, selectedCoop, search, sortData]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-5 w-5" /> Historique des chargements ({filtered.length})
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedCoop} onValueChange={setSelectedCoop}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Tous les registres" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les registres</SelectItem>
                {cooperatives.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48"
            />
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
                  <SortableHeader column="cooperative" label="Registre" sortConfig={sortConfig} onToggle={toggleSort} />
                  <SortableHeader column="destination" label="Destination" sortConfig={sortConfig} onToggle={toggleSort} />
                  <SortableHeader column="total_weight" label="Poids (kg)" sortConfig={sortConfig} onToggle={toggleSort} />
                  <SortableHeader column="total_bags" label="Sacs" sortConfig={sortConfig} onToggle={toggleSort} />
                  <SortableHeader column="created_at" label="Date" sortConfig={sortConfig} onToggle={toggleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Aucun chargement trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.connaissement || "—"}</TableCell>
                      <TableCell>{s.project}</TableCell>
                      <TableCell>{s.partners?.name || "—"}</TableCell>
                      <TableCell>{s.registres?.name || s.zone || "—"}</TableCell>
                      <TableCell>{s.destination}</TableCell>
                      <TableCell>{Number(s.total_weight).toLocaleString("fr-FR")}</TableCell>
                      <TableCell>{s.total_bags}</TableCell>
                      <TableCell className="text-xs">{new Date(s.created_at).toLocaleDateString("fr-FR")}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
