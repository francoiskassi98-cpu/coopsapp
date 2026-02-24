import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, History } from "lucide-react";
import { toast } from "sonner";

export default function ShipmentHistory() {
  const [shipments, setShipments] = useState<any[]>([]);
  const [cooperatives, setCooperatives] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCoop, setSelectedCoop] = useState("all");

  async function fetchAllRows(query: any) {
    let allData: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error || !data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return allData;
  }

  async function loadData() {
    setLoading(true);
    try {
      const [shipmentsData, coopsData] = await Promise.all([
        fetchAllRows(
          supabase.from("shipments").select("*, partners(name), cooperatives(name)").eq("status", "active").order("created_at", { ascending: false })
        ),
        supabase.from("cooperatives").select("id, name").order("name"),
      ]);
      setShipments(shipmentsData);
      setCooperatives(coopsData.data || []);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filtered = shipments.filter((s) => {
    const coopName = (s.cooperatives as any)?.name || s.zone || "";
    const matchesCoop = selectedCoop === "all" || coopName === selectedCoop;
    const matchesSearch =
      !search ||
      s.connaissement?.toLowerCase().includes(search.toLowerCase()) ||
      (s.partners as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
      coopName.toLowerCase().includes(search.toLowerCase());
    return matchesCoop && matchesSearch;
  });

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
                <SelectValue placeholder="Toutes les coopératives" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les coopératives</SelectItem>
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
                  <TableHead>Connaissement</TableHead>
                  <TableHead>Projet</TableHead>
                  <TableHead>Partenaire</TableHead>
                  <TableHead>Coopérative</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Poids (kg)</TableHead>
                  <TableHead>Sacs</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      Aucun chargement trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.connaissement || "—"}</TableCell>
                      <TableCell>{s.project}</TableCell>
                      <TableCell>{(s.partners as any)?.name || "—"}</TableCell>
                      <TableCell>{(s.cooperatives as any)?.name || s.zone || "—"}</TableCell>
                      <TableCell>{s.destination}</TableCell>
                      <TableCell>{Number(s.total_weight).toLocaleString("fr-FR")}</TableCell>
                      <TableCell>{s.total_bags}</TableCell>
                      <TableCell className="text-xs">{new Date(s.created_at).toLocaleDateString("fr-FR")}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "active" ? "default" : "destructive"}>
                          {s.status === "active" ? "Actif" : "Annulé"}
                        </Badge>
                      </TableCell>
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
