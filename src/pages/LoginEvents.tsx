import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { KeyRound, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";

interface Row { id: string; email: string | null; user_agent: string | null; created_at: string; }

export default function LoginEvents() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from("login_events") as any)
        .select("id, email, user_agent, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        icon={KeyRound}
        title="Journal de connexion"
        description="Historique des authentifications réussies."
      />
      <Card>
        <CardHeader><CardTitle className="text-base">500 dernières connexions</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Aucune connexion enregistrée.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Navigateur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{new Date(r.created_at).toLocaleString("fr-FR")}</TableCell>
                    <TableCell className="font-medium">{r.email ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-md">{r.user_agent ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
