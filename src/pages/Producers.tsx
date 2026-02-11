import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";

export default function Producers() {
  const [producers, setProducers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProducers();
  }, []);

  async function loadProducers() {
    const { data } = await supabase
      .from("producers")
      .select("*")
      .order("section", { ascending: true })
      .order("full_name", { ascending: true });
    setProducers(data || []);
    setLoading(false);
  }

  const filtered = producers.filter(
    (p) =>
      !search ||
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.plantation_code.toLowerCase().includes(search.toLowerCase()) ||
      p.section.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Registre des producteurs</h1>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, code, section..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filtered.length} producteur(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement...</p>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom complet</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Code plantation</TableHead>
                    <TableHead>Potentiel initial (kg)</TableHead>
                    <TableHead>Potentiel restant (kg)</TableHead>
                    <TableHead>Coopérative</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Aucun producteur trouvé
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.full_name}</TableCell>
                        <TableCell>{p.section}</TableCell>
                        <TableCell className="font-mono text-xs">{p.plantation_code}</TableCell>
                        <TableCell>{Number(p.delivery_potential).toLocaleString("fr-FR")}</TableCell>
                        <TableCell>{Number(p.remaining_potential).toLocaleString("fr-FR")}</TableCell>
                        <TableCell>{p.cooperative}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
